export type ExportArticle = {
  title: string;
  prefix: string | null;
  author_name: string | null;
  status: string;
  created_at: number;
  content: string;
};

const statusText: Record<string, string> = {
  pending: '승인 대기',
  feedback: '피드백',
  rejected: '반려',
  published: '승인',
};
const formatDate = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }).format(
    n,
  );

// Plain structure of one article in the document; kept separate from docx so it can be tested without a zip.
export function articleBlocks(article: ExportArticle) {
  return {
    heading: `${article.prefix ? `[${article.prefix}] ` : ''}${article.title}`,
    meta: `${article.author_name || '이름 없음'} · ${formatDate(article.created_at)} · ${statusText[article.status] || article.status}`,
    paragraphs: article.content.replace(/\r\n/g, '\n').split('\n'),
  };
}

export function exportFileName(articles: ExportArticle[], now = Date.now()) {
  const base =
    articles.length === 1
      ? `기사_${articles[0].title}`
      : `승인기사_${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now)}`;
  return `${base.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.docx`;
}

// Builds the .docx in the browser; docx is loaded only when an admin exports.
export async function newsDocx(articles: ExportArticle[]) {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');
  const children = articles.flatMap((article, index) => {
    const blocks = articleBlocks(article);
    return [
      new Paragraph({ text: blocks.heading, heading: HeadingLevel.HEADING_1, pageBreakBefore: index > 0 }),
      new Paragraph({
        children: [new TextRun({ text: blocks.meta, color: '6B7280', size: 20 })],
        spacing: { after: 240 },
      }),
      ...blocks.paragraphs.map((line) => new Paragraph({ children: [new TextRun(line)], spacing: { after: 120 } })),
    ];
  });
  const document = new Document({
    styles: { default: { document: { run: { font: '맑은 고딕', size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(document);
}
