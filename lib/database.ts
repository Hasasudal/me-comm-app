import { env } from 'cloudflare:workers';
import { HttpError } from './http-error';

export function db() {
  if (!env.DB) throw new HttpError(503, '저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  return env.DB;
}
