import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthFrame({ eyebrow, title, description, children, footer }: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" aria-label="미컴 라운지 홈">
          <span className="brand-mark">M<span>.</span></span>
          <span>미컴<span className="brand-light">라운지</span><small>MEDIA COMMUNICATION</small></span>
        </Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  );
}
