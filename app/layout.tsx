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
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
