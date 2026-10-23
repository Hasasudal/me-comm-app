import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeReturnTo } from '../app/firebase-client.ts';

test('safeReturnTo keeps same-site paths only', () => {
  assert.equal(safeReturnTo('/posts/1?tab=a#c'), '/posts/1?tab=a#c');
  for (const bad of [null, '', 'https://evil.com', '//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', '\t//evil.com'])
    assert.equal(safeReturnTo(bad), '/', JSON.stringify(bad));
});
