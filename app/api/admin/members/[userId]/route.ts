import { db, handle, HttpError, input, json, requireAdmin } from '../../../../../lib/server';

export const dynamic='force-dynamic';

export async function DELETE(request:Request,context:{params:Promise<{userId:string}>}){return handle(async()=>{
 const current=await requireAdmin();await input(request);const {userId}=await context.params;
 if(userId===current.userId)throw new HttpError(400,'자신의 관리자 권한은 회수할 수 없습니다.');
 const result=await db().prepare('UPDATE admin_users SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(Date.now(),userId).run();
 if(!result.meta.changes)throw new HttpError(404,'활성 관리자 계정을 찾을 수 없습니다.');
 return json({ok:true});
});}
