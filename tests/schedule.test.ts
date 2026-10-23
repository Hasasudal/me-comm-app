import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEDULE_MAX, SCHEDULE_MIN, validScheduleTime } from '../lib/schedule.ts';

test('validScheduleTime takes 5 minutes to 60 days ahead, whole ms only', () => {
  const now = 1_800_000_000_000;
  assert.ok(validScheduleTime(now + SCHEDULE_MIN, now));
  assert.ok(validScheduleTime(now + SCHEDULE_MAX, now));
  for (const bad of [now, now + SCHEDULE_MIN - 1, now + SCHEDULE_MAX + 1, now + SCHEDULE_MIN + 0.5, NaN, Infinity, null, '1800000600000', undefined])
    assert.equal(validScheduleTime(bad, now), false, String(bad));
});
