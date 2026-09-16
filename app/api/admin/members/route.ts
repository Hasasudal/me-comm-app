import { db, handle, json, requireAdmin } from '../../../../lib/server';

export const dynamic='force-dynamic';

export async function GET(request:Request){return handle(async()=>{
 await requireAdmin(request);
 const result=await db().prepare('SELECT user_id,email,display_name,joined_at FROM admin_users WHERE revoked_at IS NULL ORDER BY joined_at ASC').all();
 return json({members:result.results});
});}
