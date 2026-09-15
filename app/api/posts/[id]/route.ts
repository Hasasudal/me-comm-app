import { z } from 'zod';
import { db, editSchema, handle, HttpError, input, json, limit, passwordField, publicPost, publishedPost } from '../../../../lib/server';
import { verifyPassword } from '../../../../lib/password';
type Context={params:Promise<{id:string}>};
export const dynamic='force-dynamic';
async function authenticated(request:Request,id:string,password:string){await limit(request,'password',30);const post=await publishedPost(id);if(!await verifyPassword(password,post.salt,post.password_hash))throw new HttpError(403,'비밀번호가 일치하지 않습니다.');return post;}
export async function POST(request:Request,context:Context){return handle(async()=>{const {password}=z.object({password:passwordField}).parse(await input(request));const {id}=await context.params;const post=await authenticated(request,id,password);return json({post:publicPost(post)});});}
export async function PATCH(request:Request,context:Context){return handle(async()=>{const data=editSchema.parse(await input(request));const {id}=await context.params;const post=await authenticated(request,id,data.password);const status=post.category==='news'?'pending':'published';await db().prepare('UPDATE posts SET title=?,content=?,status=?,updated_at=? WHERE id=?').bind(data.title,data.content,status,Date.now(),id).run();return json({ok:true,status});});}
export async function DELETE(request:Request,context:Context){return handle(async()=>{const {password}=z.object({password:passwordField}).parse(await input(request));const {id}=await context.params;await authenticated(request,id,password);await db().prepare('DELETE FROM posts WHERE id=?').bind(id).run();return json({ok:true});});}
