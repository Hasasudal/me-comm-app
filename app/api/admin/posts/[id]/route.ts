import { z } from 'zod';
import { contentFields, db, handle, HttpError, input, json, requireAdmin } from '../../../../../lib/server';
export const dynamic='force-dynamic';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
 await requireAdmin();const body=await input(request);const {id}=await context.params;
 const command=z.discriminatedUnion('action',[z.object({action:z.literal('approve'),updated_at:z.number()}),z.object({action:z.literal('edit'),...contentFields,updated_at:z.number()})]).parse(body);
 const statement=command.action==='approve'?db().prepare("UPDATE posts SET status='published',updated_at=? WHERE id=? AND category='news' AND status='pending' AND updated_at=?").bind(Date.now(),id,command.updated_at):db().prepare("UPDATE posts SET title=?,content=?,updated_at=? WHERE id=? AND category='news' AND status='pending' AND updated_at=?").bind(command.title,command.content,Date.now(),id,command.updated_at);
 const result=await statement.run();if(!result.meta.changes)throw new HttpError(409,'다른 작업으로 글이 변경되었습니다. 목록을 새로고침해주세요.');return json({ok:true});
});}
