import assert from 'node:assert/strict';
import { normalizeSchoolEmail } from '../app/auth/firebase-errors.ts';

assert.equal(normalizeSchoolEmail('student'), 'student@ks.ac.kr');
assert.equal(normalizeSchoolEmail(' Student '), 'student@ks.ac.kr');
assert.equal(normalizeSchoolEmail('student@ks.ac.kr'), 'student@ks.ac.kr');
assert.equal(normalizeSchoolEmail('student@example.com'), 'student@example.com');

console.log('PASS: school email input accepts either the account name or the full school address.');
