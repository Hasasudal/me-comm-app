import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { verifyAdminCode } from '../../../../lib/admin-code';
import { db, handle, HttpError, input, json, limit } from '../../../../lib/server';

export const dynamic='force-dynamic';

export async function POST(request:Request){return handle(async()=>{
 const user=await getChatGPTUser();if(!user)throw new HttpError(401,'로그인이 필요합니다.');
 const {code}=z.object({code:z.string().trim().min(12,'관리자 코드를 확인해주세요.').max(128,'관리자 코드를 확인해주세요.')}).parse(await input(request));
 const hash=env.ADMIN_JOIN_CODE_HASH?.trim(),salt=env.ADMIN_JOIN_CODE_SALT?.trim();if(!hash||!salt)throw new HttpError(503,'관리자 코드가 아직 설정되지 않았습니다.');
 await limit(request,'admin-join',5);await limit(request,`admin-join:${user.userId}`,5);
 if(!await verifyAdminCode(code,salt,hash))throw new HttpError(403,'관리자 코드가 일치하지 않습니다.');
 const now=Date.now();
 await db().prepare('INSERT INTO admin_users (user_id,email,display_name,joined_at,revoked_at) VALUES (?,?,?,?,NULL) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,revoked_at=NULL').bind(user.userId,user.email,user.displayName,now).run();
 return json({ok:true},201);
});}
