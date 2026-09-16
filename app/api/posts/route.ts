import { createSchema, db, handle, HttpError, input, json, limit, recruitmentValues, requireMember } from '../../../lib/server';
import { hashPassword } from '../../../lib/password';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
 await requireMember(request);
 const category=new URL(request.url).searchParams.get('category');
 if(category&&!['board','news','clubs','contests'].includes(category))throw new HttpError(400,'지원하지 않는 게시판입니다.');
 const query=category?db().prepare("SELECT id,title,category,recruitment_status,deadline,headcount,roles,created_at FROM posts WHERE status='published' AND category=? ORDER BY created_at DESC").bind(category):db().prepare("SELECT id,title,category,recruitment_status,deadline,headcount,roles,created_at FROM posts WHERE status='published' ORDER BY created_at DESC");
 const result=await query.all();return json({posts:result.results});
});}
export async function POST(request:Request){return handle(async()=>{
 await requireMember(request);
 const data=createSchema.parse(await input(request));await limit(request,'create',10);
 const id=crypto.randomUUID(),salt=crypto.randomUUID(),now=Date.now();
 const [recruitmentStatus,deadline,headcount,roles]=recruitmentValues(data,data.category);
 const hash=await hashPassword(data.password,salt);const status=data.category==='news'?'pending':'published';
 await db().prepare('INSERT INTO posts (id,category,title,content,password_hash,salt,status,recruitment_status,deadline,headcount,roles,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,data.category,data.title,data.content,hash,salt,status,recruitmentStatus,deadline,headcount,roles,now,now).run();
 return json({id,status},201);
});}
