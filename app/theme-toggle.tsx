'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

// Cycles 시스템 → 라이트 → 다크. The choice is stored in this browser; app/layout.tsx applies it before paint.
const order = ['system', 'light', 'dark'] as const;
type Theme = (typeof order)[number];
const labels: Record<Theme, string> = { system: '기기 설정', light: '라이트', dark: '다크' };
const icons = { system: Monitor, light: Sun, dark: Moon };

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    // Read after hydration so the server render and the first client render agree.
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem('micom:theme');
        if (saved === 'light' || saved === 'dark') setTheme(saved);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const next = order[(order.indexOf(theme) + 1) % order.length];
  function change() {
    setTheme(next);
    try {
      if (next === 'system') localStorage.removeItem('micom:theme');
      else localStorage.setItem('micom:theme', next);
    } catch {}
    window.dispatchEvent(new Event('micom:theme'));
  }
  const Icon = icons[theme];
  return (
    <button
      type="button"
      aria-label={`화면 테마: ${labels[theme]} (누르면 ${labels[next]})`}
      title={`화면 테마: ${labels[theme]}`}
      onClick={change}
    >
      <Icon size={18} />
    </button>
  );
}
