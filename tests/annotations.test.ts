import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, segments } from '../lib/annotations.ts';

test('overlapping marks split into flat segments with memo numbers at mark ends', () => {
  const result = segments('가나다라마바', [
    { start: 3, end: 5, type: 'memo', memo: '두번째' },
    { start: 0, end: 4, type: 'highlight' },
    { start: 1, end: 2, type: 'memo', memo: '첫번째' },
    { start: 2, end: 4, type: 'bold' },
  ]);
  assert.deepEqual(
    result.map((s) => s.text),
    ['가', '나', '다', '라', '마', '바'],
  );
  assert.deepEqual(
    result.map((s) => s.highlight),
    [true, true, true, true, false, false],
  );
  assert.deepEqual(
    result.map((s) => s.bold),
    [false, false, true, true, false, false],
  );
  assert.deepEqual(
    result.map((s) => s.memoStarts),
    [[], [1], [], [2], [], []],
  );
  assert.deepEqual(
    result.map((s) => s.memoEnds),
    [[], [1], [], [], [2], []],
  );
  assert.equal(result.map((s) => s.text).join(''), '가나다라마바');
});

test('marks outside the content are ignored', () => {
  assert.deepEqual(
    segments('abc', [
      { start: 1, end: 9, type: 'bold' },
      { start: 2, end: 2, type: 'bold' },
    ]).map((s) => [s.text, s.bold]),
    [['abc', false]],
  );
});

test('overlap detection treats ranges as half-open', () => {
  const mark = { start: 2, end: 5, type: 'bold' as const };
  assert.equal(overlaps(mark, 0, 2), false);
  assert.equal(overlaps(mark, 4, 9), true);
  assert.equal(overlaps(mark, 5, 6), false);
});
