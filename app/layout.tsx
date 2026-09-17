import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '미컴 라운지 | 학과 커뮤니티',
  description: '학과 소식부터 동아리와 공모전 팀원 모집까지, 미컴 라운지.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
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
