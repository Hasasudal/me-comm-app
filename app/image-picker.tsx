'use client';

import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

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

export function ImageGallery({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <div className="image-gallery">
      {keys.map((key) => (
        <a key={key} href={imageUrl(key)} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(key)} alt="첨부 사진" loading="lazy" />
        </a>
      ))}
    </div>
  );
}
