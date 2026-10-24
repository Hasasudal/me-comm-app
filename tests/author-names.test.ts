import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hidden, isReservedName } from '../lib/author-names.ts';

test('reserved names are refused for members, with fillers, extra words and fullwidth forms', () => {
  for (const name of [
    '관리자',
    '관리자\u3164',
    '관\u3164리자',
    '관리자님',
    '미컴 관리자',
    '관리자2',
    '[운영자]',
    'ＡＤＭＩＮ',
    'Admin_01',
    '학생회장',
    '학사팀',
    '학사\uFFA0',
  ])
    assert.ok(isReservedName(name, 'member'), name);
});

test('staff may use their own role name but not another', () => {
  assert.ok(!isReservedName('학사팀', 'academic'));
  assert.ok(isReservedName('관리자', 'academic'));
  assert.ok(!isReservedName('학생회장', 'council'));
  assert.ok(isReservedName('학사', 'council'));
});

test('ordinary names pass', () => {
  for (const name of ['김민수', '컴공 동아리', 'Jane', '수학자', 'Badminton Club'])
    assert.ok(!isReservedName(name, 'member'), name);
});

test('invisible fillers are rejected as hidden', () => {
  for (const c of ['\u3164', '\u00AD', '\uFFA0', '\u115F', '\u2060', '\u2800']) assert.ok(hidden.test(`a${c}`));
});
