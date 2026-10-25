import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '미컴 라운지 | 학과 커뮤니티',
  description: '학과 소식부터 동아리와 공모전 팀원 모집까지, 미컴 라운지.',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

// viewport-fit=cover lets pages reach under the iPhone notch and home bar; globals.css pads edges with the
// safe-area insets (--safe-*) so nothing ends up hidden there.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e131c' },
  ],
};

// Runs before first paint so a saved dark/light choice never flashes the other theme. 'system' (or nothing saved)
// follows the device and keeps following it while the page is open. theme-toggle.tsx writes the choice.
const themeScript = `(function(){var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)');function a(){var p=null;try{p=localStorage.getItem('micom:theme')}catch(e){}d.dataset.theme=p==='dark'||p==='light'?p:m.matches?'dark':'light'}a();m.addEventListener('change',a);window.addEventListener('micom:theme',a)})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The script sets data-theme on <html> before React hydrates, so its attributes differ by design.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
