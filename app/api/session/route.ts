import { handle, identity, json } from '../../../lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => json(await identity(request)));
}
