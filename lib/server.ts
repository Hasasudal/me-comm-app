import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { z } from 'zod';

export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export function db(){if(!env.DB)throw new HttpError(503,'저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');return env.DB;}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});}
export async function handle(action:()=>Promise<Response>){try{return await action();}catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);if(e instanceof z.ZodError)return json({error:e.issues[0]?.message||'입력 내용을 확인해주세요.'},400);console.error('Community API failed',e instanceof Error?e.message:'Unknown error');return json({error:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'},503);}}
export async function input(request:Request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)throw new HttpError(403,'허용되지 않은 요청입니다.');
 if(!request.headers.get('content-type')?.includes('application/json'))throw new HttpError(415,'JSON 요청이 필요합니다.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'입력 내용이 없습니다.');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100000){await reader.cancel();throw new HttpError(413,'입력 내용이 너무 큽니다.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'입력 형식이 올바르지 않습니다.');}
}
export const contentFields={title:z.string().trim().min(1,'제목을 입력해주세요.').max(120,'제목은 120자 이내로 입력해주세요.'),content:z.string().trim().min(1,'본문을 입력해주세요.').max(20000,'본문은 20,000자 이내로 입력해주세요.')};
export const passwordField=z.string().min(8,'비밀번호는 8자 이상 입력해주세요.').max(128,'비밀번호는 128자 이내로 입력해주세요.');
export const recruitmentFields={recruitment_status:z.enum(['open','closed']).optional().nullable(),deadline:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'마감일을 확인해주세요.').optional().nullable(),headcount:z.number().int().min(1,'모집 인원은 1명 이상이어야 합니다.').max(99,'모집 인원은 99명 이내로 입력해주세요.').optional().nullable(),roles:z.string().trim().min(1,'필요한 역할을 입력해주세요.').max(200,'필요한 역할은 200자 이내로 입력해주세요.').optional().nullable()};
export const createSchema=z.object({...contentFields,...recruitmentFields,category:z.enum(['board','news','clubs','contests']),password:passwordField});
export const editSchema=z.object({...contentFields,...recruitmentFields,password:passwordField});
export function recruitmentValues(data:{recruitment_status?:'open'|'closed'|null;deadline?:string|null;headcount?:number|null;roles?:string|null},category:string){
 if(category!=='clubs'&&category!=='contests')return [null,null,null,null] as const;
 if(!data.recruitment_status||!data.deadline||!data.headcount||!data.roles)throw new HttpError(400,'모집 상태, 마감일, 인원과 필요한 역할을 모두 입력해주세요.');
 return [data.recruitment_status,data.deadline,data.headcount,data.roles] as const;
}
export async function identity(){const user=await getChatGPTUser();const email=env.ADMIN_EMAIL?.trim().toLowerCase();return {admin:!!email&&!!user&&user.email.toLowerCase()===email,signedIn:!!user,configured:!!email};}
export async function requireAdmin(){const user=await identity();if(!user.admin)throw new HttpError(403,'뉴스 승인 권한이 필요합니다.');}
export async function limit(request:Request,scope:string,max=30){
 const ip=request.headers.get('cf-connecting-ip')||'local';
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${scope}:${ip}`));
 const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const now=Date.now();
 await db().prepare('DELETE FROM attempts WHERE expires_at < ?').bind(now).run();
 const result=await db().prepare('INSERT INTO attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+60000).first<{count:number}>();
 if(result&&result.count>max)throw new HttpError(429,'요청이 너무 많습니다. 1분 후 다시 시도해주세요.');
}
export type PostRow={id:string;category:string;title:string;content:string;password_hash:string;salt:string;status:string;recruitment_status:'open'|'closed'|null;deadline:string|null;headcount:number|null;roles:string|null;created_at:number;updated_at:number};
export async function publishedPost(id:string){const post=await db().prepare("SELECT * FROM posts WHERE id=? AND status='published'").bind(id).first<PostRow>();if(!post)throw new HttpError(404,'게시글을 찾을 수 없습니다.');return post;}
export function publicPost(post:PostRow){return {id:post.id,category:post.category,title:post.title,content:post.content,status:post.status,recruitment_status:post.recruitment_status,deadline:post.deadline,headcount:post.headcount,roles:post.roles,created_at:post.created_at,updated_at:post.updated_at};}
export function publicMetadata(post:PostRow){return {id:post.id,category:post.category,title:post.title,status:post.status,recruitment_status:post.recruitment_status,deadline:post.deadline,headcount:post.headcount,roles:post.roles,created_at:post.created_at,updated_at:post.updated_at};}
