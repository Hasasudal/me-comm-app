// Newsletter schedule window (no server imports, so the admin page and node tests can use it too).
// The cron runs every 10 minutes, so a send starts up to 10 minutes after the chosen time.
export const SCHEDULE_MIN = 5 * 60000;
export const SCHEDULE_MAX = 60 * 86400000;
export const SCHEDULE_ERROR = '예약 시각을 확인해주세요.';
/** `at` is UTC ms. */
export function validScheduleTime(at: unknown, now = Date.now()): at is number {
  return Number.isSafeInteger(at) && (at as number) >= now + SCHEDULE_MIN && (at as number) <= now + SCHEDULE_MAX;
}
