import { env } from 'cloudflare:workers';
import { HttpError } from './http-error';

export function db() {
  if (!env.DB) throw new HttpError(503, '지금 서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  return env.DB;
}
