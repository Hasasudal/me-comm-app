import type { Role } from './member-auth';

// C0 controls, DEL, bidi overrides/isolates and zero-width marks: invisible, so they spoof names or hide text.
export const hidden =
  /[\u0000-\u001F\u007F\u00AD\u115F\u1160\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0]/;
// Multi-line text keeps \t, \n and the zero-width joiner (U+200D, used inside emoji); the rest is dropped.
export const hiddenInText =
  /[\u0000-\u0008\u000B-\u001F\u007F\u00AD\u115F\u1160\u180E\u200B\u200C\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0]/g;
// Staff may sign as their own role; admins as any of these. Compared after NFKC (fullwidth ＡＤＭＩＮ → admin),
// keeping only letters and digits (so '[관리자]' or '관 리.자' match) and ignoring case.
// [name, role allowed to use it, whether it is refused anywhere inside a name or only as its start/end].
// 관리자님 or "미컴 관리자" must not pass; 학사 and admin only count at the start or end (수학자, badminton).
const reservedNames: [string, Role | null, boolean][] = [
  ['관리자', null, true],
  ['운영자', null, true],
  ['admin', null, false],
  ['학사', 'academic', false],
  ['학생회', 'council', true],
];
export const reservedKey = (name: string) =>
  name
    .normalize('NFKC')
    .replace(hiddenInText, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
/** True when `name` could pass for staff, unless `role` is the role it names. */
export const isReservedName = (name: string, role: Role) => {
  const key = reservedKey(name);
  return reservedNames.some(
    ([word, own, anywhere]) =>
      own !== role && (anywhere ? key.includes(word) : key.startsWith(word) || key.endsWith(word)),
  );
};
