import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleBlocks, exportFileName, newsDocx } from '../lib/news-docx.ts';

const article = {
  title: '가을 축제 개최',
  prefix: '행사',
  author_name: '김기자',
  status: 'published',
  created_at: Date.UTC(2026, 8, 17, 3),
  content: '첫 문단\r\n둘째 문단\n\n넷째 줄',
};

test('article blocks keep prefix, meta and every line', () => {
  assert.deepEqual(articleBlocks(article), {
    heading: '[행사] 가을 축제 개최',
    meta: '김기자 · 2026년 9월 17일 · 승인',
    paragraphs: ['첫 문단', '둘째 문단', '', '넷째 줄'],
  });
});

test('file names are safe for Windows and name bundles by date', () => {
  assert.equal(exportFileName([{ ...article, title: 'a/b:c?' }]), '기사_a_b_c_.docx');
  assert.equal(exportFileName([article, article], Date.UTC(2026, 8, 17, 16)), '승인기사_2026-09-18.docx');
});

test('the generated file is a docx zip', async () => {
  const blob = await newsDocx([article, article]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b], 'starts with the ZIP signature');
  assert.ok(bytes.length > 3000);
});

test('photos are embedded in the document', async () => {
  const photo = { data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 1600, height: 900 };
  const blob = await newsDocx([{ ...article, photos: [photo] }]);
  const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  assert.match(text, /word\/media\/[^"]+\.jpg/, 'the zip carries a media file');
});
