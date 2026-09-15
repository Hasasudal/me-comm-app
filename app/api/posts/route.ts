import { createSchema, db, handle, input, json, limit } from '../../../lib/server';
import { hashPassword } from '../../../lib/password';
export const dynamic='force-dynamic';
export async function GET(){return handle(async()=>{const result=await db().prepare("SELECT id,title,category,created_at FROM posts WHERE status='published' ORDER BY created_at DESC").all();return json({posts:result.results});});}
export async function POST(request:Request){return handle(async()=>{
 const data=createSchema.parse(await input(request));await limit(request,'create',10);
 const id=crypto.randomUUID(),salt=crypto.randomUUID(),now=Date.now();
 const hash=await hashPassword(data.password,salt);const status=data.category==='news'?'pending':'published';
 await db().prepare('INSERT INTO posts (id,category,title,content,password_hash,salt,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,data.category,data.title,data.content,hash,salt,status,now,now).run();
 return json({id,status},201);
});}
