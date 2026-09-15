import { handle, identity, json } from '../../../lib/server';
export const dynamic='force-dynamic';
export async function GET(){return handle(async()=>json(await identity()));}
