import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDeadline, recruitmentState } from '../lib/recruitment.ts';

// 2026-09-18 00:30 in Seoul, still 09-17 in UTC.
const now = Date.UTC(2026, 8, 17, 15, 30);

test('an open post past its deadline in Korean time reads as closed', () => {
  assert.equal(recruitmentState('open', '2026-09-17', now), 'closed');
  assert.equal(recruitmentState(null, '2026-09-17', now), 'closed');
});

test('the deadline day itself is still open, and other states pass through', () => {
  assert.equal(recruitmentState('open', '2026-09-18', now), 'open');
  assert.equal(recruitmentState('closed', '2026-12-31', now), 'closed');
  assert.equal(recruitmentState('open', null, now), 'open');
  assert.equal(recruitmentState(null, null, now), null);
});

test('deadlines read as Korean dates, with the year only when it differs', () => {
  assert.equal(formatDeadline('2026-11-20', now), '11월 20일(금)');
  assert.equal(formatDeadline('2027-01-15', now), '2027년 1월 15일(금)');
  assert.equal(formatDeadline('not-a-date', now), 'not-a-date');
});
