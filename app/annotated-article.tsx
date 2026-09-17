'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Bold, Eraser, Highlighter, StickyNote, X } from 'lucide-react';
import { memoNumbers, overlaps, segments, type Mark, type MarkType } from '../lib/annotations';

export const statusLabels: Record<string, string> = {
  pending: '승인 대기',
  feedback: '피드백',
  rejected: '반려',
  published: '승인',
};
type SelectedRange = { start: number; end: number };
type Toolbar = SelectedRange & { top: number; left: number };

// Converts the DOM selection into plain-text offsets; memo badges are CSS pseudo-elements so they never shift the count.
function selectionOffsets(root: HTMLElement): { range: SelectedRange; rect: DOMRect } | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length,
    end = start + range.toString().length;
  return end > start ? { range: { start, end }, rect: range.getBoundingClientRect() } : null;
}

export function excerpt(content: string, range: SelectedRange) {
  const text = content.slice(range.start, range.end).replace(/\s+/g, ' ');
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function ArticleText({ content, marks }: { content: string; marks: Mark[] }) {
  return (
    <>
      {segments(content, marks).map((segment, index) => {
        let node: ReactNode = segment.text;
        if (segment.bold) node = <strong>{node}</strong>;
        if (segment.highlight) node = <mark>{node}</mark>;
        return (
          <span
            key={index}
            className={segment.memo ? 'memo-mark' : undefined}
            data-memo-anchor={segment.memoStarts.length ? segment.memoStarts.join(' ') : undefined}
            data-memo={segment.memoEnds.length ? segment.memoEnds.join(',') : undefined}
          >
            {node}
          </span>
        );
      })}
    </>
  );
}

// Narrow screens have no margin, so marks fall back to a list under the article.
function MarkList({ content, marks, onRemove }: { content: string; marks: Mark[]; onRemove?: (mark: Mark) => void }) {
  if (!marks.length) return null;
  const numbers = memoNumbers(marks);
  const ordered = [...marks].sort((a, b) => a.start - b.start || a.end - b.end);
  return (
    <ul className="mark-list">
      {ordered.map((mark, index) => (
        <li key={index}>
          <span className={`mark-kind ${mark.type}`}>
            {mark.type === 'memo' ? `메모 ${numbers.get(mark)}` : mark.type === 'bold' ? '굵게' : '형광펜'}
          </span>
          <div>
            <q>{excerpt(content, mark)}</q>
            {mark.memo && <p>{mark.memo}</p>}
          </div>
          {onRemove && (
            <button type="button" aria-label="표시 삭제" onClick={() => onRemove(mark)}>
              <X size={15} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Article with feedback marks, memo cards in the right margin, and — when onChange is given —
 * a floating toolbar that appears over a text selection.
 */
export function AnnotatedArticle({
  content,
  marks,
  onChange,
  className = '',
}: {
  content: string;
  marks: Mark[];
  onChange?: (marks: Mark[]) => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null),
    article = useRef<HTMLElement>(null),
    margin = useRef<HTMLDivElement>(null),
    memoInput = useRef<HTMLInputElement>(null);
  const [toolbar, setToolbar] = useState<Toolbar | null>(null);
  const [memoMode, setMemoMode] = useState(false);
  const [memoText, setMemoText] = useState('');
  const numbers = memoNumbers(marks);
  const memos = marks.filter((mark) => mark.type === 'memo').sort((a, b) => numbers.get(a)! - numbers.get(b)!);

  // Place each memo card beside its anchor line, pushing cards down so they never overlap.
  useLayoutEffect(() => {
    const place = () => {
      const box = margin.current,
        text = article.current;
      if (!box || !text) return;
      const origin = box.getBoundingClientRect().top;
      let floor = 0;
      for (const card of Array.from(box.querySelectorAll<HTMLElement>('[data-card]'))) {
        const anchor = text.querySelector<HTMLElement>(`[data-memo-anchor~="${card.dataset.card}"]`);
        const top = Math.max(anchor ? anchor.getBoundingClientRect().top - origin : floor, floor);
        card.style.top = `${top}px`;
        floor = top + card.offsetHeight + 8;
      }
      box.style.minHeight = `${floor}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    if (article.current) observer.observe(article.current);
    return () => observer.disconnect();
  }, [content, marks]);

  function capture() {
    if (!onChange || !article.current || !wrap.current) return;
    const found = selectionOffsets(article.current);
    if (!found) {
      setToolbar(null);
      setMemoMode(false);
      return;
    }
    const box = wrap.current.getBoundingClientRect();
    setToolbar({
      ...found.range,
      top: found.rect.top - box.top,
      left: Math.min(Math.max(found.rect.left + found.rect.width / 2 - box.left, 120), box.width - 120),
    });
    setMemoMode(false);
    setMemoText('');
  }
  function close() {
    setToolbar(null);
    setMemoMode(false);
    setMemoText('');
    window.getSelection()?.removeAllRanges();
  }
  function add(type: MarkType) {
    if (!toolbar || !onChange) return;
    if (type === 'memo' && !memoMode) {
      setMemoMode(true);
      setTimeout(() => memoInput.current?.focus(), 0);
      return;
    }
    if (type === 'memo' && !memoText.trim()) return;
    onChange([
      ...marks,
      { start: toolbar.start, end: toolbar.end, type, ...(type === 'memo' ? { memo: memoText.trim() } : {}) },
    ]);
    close();
  }
  function erase() {
    if (toolbar && onChange) {
      onChange(marks.filter((mark) => !overlaps(mark, toolbar.start, toolbar.end)));
      close();
    }
  }
  function memoKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      add('memo');
    }
    if (event.key === 'Escape') close();
  }
  const remove = onChange ? (target: Mark) => onChange(marks.filter((mark) => mark !== target)) : undefined;
  const hasOverlap = !!toolbar && marks.some((mark) => overlaps(mark, toolbar.start, toolbar.end));

  return (
    <div className={`annotated-layout ${memos.length ? 'has-memos' : ''} ${className}`} ref={wrap}>
      <article
        ref={article}
        className={`article-content annotated ${onChange ? 'editable' : ''}`}
        onMouseUp={onChange ? capture : undefined}
        onKeyUp={onChange ? capture : undefined}
      >
        <ArticleText content={content} marks={marks} />
      </article>
      {memos.length > 0 && (
        <div className="margin-notes" ref={margin} aria-label="메모">
          {memos.map((mark) => (
            <div
              className="memo-card"
              key={`${mark.start}-${mark.end}-${numbers.get(mark)}`}
              data-card={numbers.get(mark)}
            >
              <span className="memo-number">{numbers.get(mark)}</span>
              <p>{mark.memo}</p>
              {remove && (
                <button type="button" aria-label={`메모 ${numbers.get(mark)} 삭제`} onClick={() => remove(mark)}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mark-list-fallback">
        <MarkList content={content} marks={marks} onRemove={remove} />
      </div>
      {toolbar && (
        <div
          className="selection-toolbar"
          role="toolbar"
          aria-label="선택한 부분 표시"
          style={{ top: toolbar.top, left: toolbar.left }}
          onMouseDown={(event) => {
            if (!(event.target as HTMLElement).closest('input')) event.preventDefault();
          }}
        >
          {memoMode ? (
            <>
              <input
                ref={memoInput}
                value={memoText}
                onChange={(event) => setMemoText(event.target.value)}
                onKeyDown={memoKeys}
                maxLength={500}
                placeholder="메모 입력 후 Enter"
                aria-label="메모 내용"
              />
              <button type="button" className="toolbar-confirm" disabled={!memoText.trim()} onClick={() => add('memo')}>
                추가
              </button>
              <button type="button" aria-label="취소" onClick={close}>
                <X size={15} />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => add('highlight')}>
                <Highlighter size={15} />
                형광펜
              </button>
              <button type="button" onClick={() => add('bold')}>
                <Bold size={15} />
                굵게
              </button>
              <button type="button" onClick={() => add('memo')}>
                <StickyNote size={15} />
                메모
              </button>
              {hasOverlap && (
                <button type="button" onClick={erase}>
                  <Eraser size={15} />
                  지우기
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
