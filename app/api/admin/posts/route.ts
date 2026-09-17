import { z } from 'zod';
import { db, handle, json, parseReview, requireAdmin } from '../../../../lib/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
 await requireAdmin(request);
 const status=z.enum(['pending','feedback','rejected','published']).catch('pending').parse(new URL(request.url).searchParams.get('status')||'pending');
 const rows=await db().prepare("SELECT id,title,category,content,prefix,author_name,status,feedback,created_at,updated_at FROM posts WHERE category='news' AND status=? ORDER BY updated_at DESC").bind(status).all<{feedback:string|null}>();
 return json({posts:rows.results.map(row=>({...row,feedback:parseReview(row.feedback)}))});
});}
