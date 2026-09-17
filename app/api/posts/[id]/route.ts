import { z } from 'zod';
import { checkPostPassword, db, editSchema, handle, HttpError, input, isAdmin, json, passwordField, publicPost, recruitmentValues, requireMember, visiblePost } from '../../../../lib/server';
type Context={params:Promise<{id:string}>};
export const dynamic='force-dynamic';
export async function GET(request:Request,context:Context){return handle(async()=>{const member=await requireMember(request);const {id}=await context.params;return json({post:publicPost(await visiblePost(id,member,await isAdmin(member.userId)))});});}
export async function PATCH(request:Request,context:Context){return handle(async()=>{
 const member=await requireMember(request);const admin=await isAdmin(member.userId);const data=editSchema.parse(await input(request));const {id}=await context.params;
 const post=await visiblePost(id,member,admin);await checkPostPassword(request,post,data.password,admin);
 const news=post.category==='news';
 if(news&&post.status==='rejected'&&!admin)throw new HttpError(409,'반려된 기사는 수정할 수 없습니다. 새 기사로 작성해주세요.');
 // Any change to news sends it back for review and clears the previous feedback.
 const status=news?'pending':'published';const feedback=news?null:post.feedback;
 const [recruitmentStatus,deadline,headcount,roles]=recruitmentValues(data,post.category);
 await db().prepare('UPDATE posts SET title=?,content=?,author_name=?,prefix=?,status=?,feedback=?,recruitment_status=?,deadline=?,headcount=?,roles=?,updated_at=? WHERE id=?').bind(data.title,data.content,data.author_name,data.prefix,status,feedback,recruitmentStatus,deadline,headcount,roles,Date.now(),id).run();
 return json({ok:true,status});
});}
export async function DELETE(request:Request,context:Context){return handle(async()=>{
 const member=await requireMember(request);const admin=await isAdmin(member.userId);const {password}=z.object({password:passwordField.optional()}).parse(await input(request));const {id}=await context.params;
 const post=await visiblePost(id,member,admin);await checkPostPassword(request,post,password,admin);
 await db().prepare('DELETE FROM posts WHERE id=?').bind(id).run();return json({ok:true});
});}
