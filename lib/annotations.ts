export type MarkType = 'highlight' | 'bold' | 'memo';
export type Mark = { start: number; end: number; type: MarkType; memo?: string };
export type Review = { note: string; marks: Mark[] };
export type Segment = {
  text: string;
  bold: boolean;
  highlight: boolean;
  memo: boolean;
  memoStarts: number[];
  memoEnds: number[];
};

// Memo numbers follow reading order so the list under the article matches the badges.
export function memoNumbers(marks: Mark[]) {
  const memos = marks.filter((mark) => mark.type === 'memo').sort((a, b) => a.start - b.start || a.end - b.end);
  return new Map(memos.map((mark, index) => [mark, index + 1]));
}

// Splits content at every mark boundary so overlapping marks render as flat, nested-free spans.
export function segments(content: string, marks: Mark[]): Segment[] {
  const valid = marks.filter((mark) => mark.start >= 0 && mark.end <= content.length && mark.start < mark.end);
  const numbers = memoNumbers(valid);
  const cuts = [...new Set([0, content.length, ...valid.flatMap((mark) => [mark.start, mark.end])])].sort(
    (a, b) => a - b,
  );
  const result: Segment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i],
      to = cuts[i + 1];
    const active = valid.filter((mark) => mark.start <= from && mark.end >= to);
    result.push({
      text: content.slice(from, to),
      bold: active.some((mark) => mark.type === 'bold'),
      highlight: active.some((mark) => mark.type === 'highlight'),
      memo: active.some((mark) => mark.type === 'memo'),
      memoStarts: active
        .filter((mark) => mark.type === 'memo' && mark.start === from)
        .map((mark) => numbers.get(mark)!),
      memoEnds: active.filter((mark) => mark.type === 'memo' && mark.end === to).map((mark) => numbers.get(mark)!),
    });
  }
  return result;
}

// Marks touching [start,end) — used to clear formatting from a selection.
export function overlaps(mark: Mark, start: number, end: number) {
  return mark.start < end && mark.end > start;
}
