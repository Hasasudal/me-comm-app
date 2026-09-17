'use client';

import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { memoNumbers, segments, type Mark } from '../lib/annotations';

export const statusLabels:Record<string,string>={pending:'승인 대기',feedback:'피드백',rejected:'반려',published:'승인'};
export type SelectedRange={start:number;end:number};

// Converts the DOM selection into plain-text offsets; memo badges are CSS pseudo-elements so they never shift the count.
function selectionOffsets(root:HTMLElement):SelectedRange|null{
 const selection=window.getSelection();if(!selection||!selection.rangeCount||selection.isCollapsed)return null;
 const range=selection.getRangeAt(0);if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
 const before=document.createRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);
 const start=before.toString().length,end=start+range.toString().length;return end>start?{start,end}:null;
}

export function AnnotatedArticle({content,marks,className='',onSelectRange}:{content:string;marks:Mark[];className?:string;onSelectRange?:(range:SelectedRange|null)=>void}){
 const ref=useRef<HTMLElement>(null);
 const capture=onSelectRange?()=>{if(ref.current)onSelectRange(selectionOffsets(ref.current));}:undefined;
 return <article ref={ref} className={`article-content annotated ${className}`} onMouseUp={capture} onKeyUp={capture}>{segments(content,marks).map((segment,index)=>{
  let node:ReactNode=segment.text;if(segment.bold)node=<strong>{node}</strong>;if(segment.highlight)node=<mark>{node}</mark>;
  return <span key={index} className={segment.memo?'memo-mark':undefined} data-memo={segment.memoEnds.length?segment.memoEnds.join(','):undefined}>{node}</span>;
 })}</article>;
}

export function excerpt(content:string,range:SelectedRange){const text=content.slice(range.start,range.end).replace(/\s+/g,' ');return text.length>40?`${text.slice(0,40)}…`:text;}

export function MarkList({content,marks,onRemove}:{content:string;marks:Mark[];onRemove?:(index:number)=>void}){
 if(!marks.length)return null;const numbers=memoNumbers(marks);
 const ordered=marks.map((mark,index)=>({mark,index})).sort((a,b)=>a.mark.start-b.mark.start||a.mark.end-b.mark.end);
 return <ul className="mark-list">{ordered.map(({mark,index})=><li key={index}><span className={`mark-kind ${mark.type}`}>{mark.type==='memo'?`메모 ${numbers.get(mark)}`:mark.type==='bold'?'굵게':'형광펜'}</span><div><q>{excerpt(content,mark)}</q>{mark.memo&&<p>{mark.memo}</p>}</div>{onRemove&&<button type="button" aria-label="표시 삭제" onClick={()=>onRemove(index)}><X size={15}/></button>}</li>)}</ul>;
}
