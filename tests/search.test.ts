import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchSnippet } from '../lib/search.ts';

test('snippet centres on the first match and marks trimmed ends', () => {
  const body = '가'.repeat(50) + '\n졸업 전시회 안내\n' + '나'.repeat(50);
  assert.equal(searchSnippet(body, '전시회', 3), '…졸업 전시회 안내…');
  assert.equal(searchSnippet('Hello World', 'world'), 'Hello World', 'case-insensitive, no ellipsis when whole');
  assert.equal(searchSnippet('abc', 'zzz'), null);
});
