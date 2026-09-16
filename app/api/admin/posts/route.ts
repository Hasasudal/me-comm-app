import { db, handle, json, requireAdmin } from '../../../../lib/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{await requireAdmin(request);const rows=await db().prepare("SELECT id,title,category,content,status,created_at,updated_at FROM posts WHERE category='news' AND status='pending' ORDER BY created_at ASC").all();return json({posts:rows.results});});}
