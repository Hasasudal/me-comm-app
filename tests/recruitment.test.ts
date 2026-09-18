import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recruitmentState } from '../lib/recruitment.ts';

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
