import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Baseline browser protections for every page and API response.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
      {
        // Pages always revalidate, so a phone that kept an old tab open picks up a new release on reload.
        // Hashed chunks under /_next keep their long immutable cache; API routes set their own no-store.
        source: '/:page(|board|inquiry|complaint|news|clubs|contests|login|signup|verify-email|account|admin|help)',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      { source: '/posts/:id', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/admin/members', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/auth/action', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default nextConfig;
