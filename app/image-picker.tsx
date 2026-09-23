'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';

const MAX_IMAGES = 5;
const MAX_SIDE = 1600;
export const imageUrl = (key: string) => `/api/images/${key}`;

// Phone photos are often 5-10MB; shrink to at most 1600px and re-encode before upload.
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.82));
  // Browsers without WebP encoding hand back PNG; JPEG keeps those small.
  const webp = await encode('image/webp');
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg');
  if (!blob) throw new Error('사진을 처리하지 못했습니다.');
  return blob;
}

async function upload(file: File) {
  const blob = await shrink(file);
  const response = await fetch('/api/images', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  const data = (await response.json().catch(() => ({}))) as { key?: string; error?: string };
  if (!response.ok || !data.key) throw new Error(data.error || '사진을 올리지 못했습니다.');
  return data.key;
}

export function ImagePicker({
  value,
  onChange,
  onBusy,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');

  async function add(files: FileList | null) {
    const picked = Array.from(files || []).slice(0, MAX_IMAGES - value.length);
    if (!picked.length) return;
    setError('');
    setUploading(picked.length);
    onBusy?.(true);
    const keys = [...value];
    for (const file of picked) {
      try {
        keys.push(await upload(file));
        onChange([...keys]);
      } catch (e) {
        setError((e as Error).message);
      }
      setUploading((n) => n - 1);
    }
    onBusy?.(false);
  }

  return (
    <div className="image-picker">
      <span className="image-picker-label">
        사진 <small>(선택 · 최대 {MAX_IMAGES}장)</small>
      </span>
      <div className="image-grid">
        {value.map((key) => (
          <div className="image-thumb" key={key}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(key)} alt="첨부한 사진" />
            <button type="button" aria-label="사진 빼기" onClick={() => onChange(value.filter((k) => k !== key))}>
              <X size={14} />
            </button>
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div className="image-thumb loading" key={`loading-${i}`} aria-label="사진 올리는 중" />
        ))}
        {value.length + uploading < MAX_IMAGES && (
          <label className="image-add">
            <ImagePlus size={20} />
            <span>추가</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              onChange={(e) => {
                void add(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// Word cannot embed WebP, so photos are re-encoded as JPEG for the export.
export async function photoForWord(key: string) {
  const response = await fetch(imageUrl(key));
  if (!response.ok) throw new Error('사진을 불러오지 못했습니다.');
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
  if (!blob) throw new Error('사진을 변환하지 못했습니다.');
  return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

// Thumbnails open an in-page viewer (a new tab breaks the flow on phones and in the app); modified clicks still
// open the original in a new tab. The viewer steps with buttons, arrow keys or a sideways swipe.
export function ImageGallery({ keys }: { keys: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  const swipeFrom = useRef<number | null>(null);
  useEffect(() => {
    if (open === null) viewer.current?.close();
    else if (!viewer.current?.open) viewer.current?.showModal();
  }, [open]);
  if (!keys.length) return null;
  const step = (by: number) => setOpen((at) => (at === null ? at : (at + by + keys.length) % keys.length));
  return (
    <div className="image-gallery">
      {keys.map((key, index) => (
        <a
          key={key}
          href={imageUrl(key)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            setOpen(index);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(key)} alt={`첨부 사진 ${index + 1}`} loading="lazy" />
        </a>
      ))}
      <dialog
        ref={viewer}
        className="photo-viewer"
        aria-label="사진 크게 보기"
        onClose={() => setOpen(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') step(-1);
          if (e.key === 'ArrowRight') step(1);
        }}
        onTouchStart={(e) => (swipeFrom.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const moved = swipeFrom.current === null ? 0 : e.changedTouches[0].clientX - swipeFrom.current;
          swipeFrom.current = null;
          if (Math.abs(moved) > 50) step(moved < 0 ? 1 : -1);
        }}
      >
        {open !== null && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(keys[open])} alt={`첨부 사진 ${open + 1}`} />
            <div className="photo-viewer-bar">
              {keys.length > 1 && (
                <button aria-label="이전 사진" onClick={() => step(-1)}>
                  <ChevronLeft size={22} />
                </button>
              )}
              <span>
                {open + 1} / {keys.length}
              </span>
              {keys.length > 1 && (
                <button aria-label="다음 사진" onClick={() => step(1)}>
                  <ChevronRight size={22} />
                </button>
              )}
              <a href={imageUrl(keys[open])} target="_blank" rel="noopener noreferrer">
                원본 보기
              </a>
              <button aria-label="닫기" onClick={() => setOpen(null)}>
                <X size={22} />
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
