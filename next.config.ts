import type { NextConfig } from 'next';

// Enforced after a Report-Only trial showed no violations across login, posting with photos and the admin pages.
// script-src needs 'unsafe-inline' because vinext inlines the RSC payload and bootstrap as <script> tags; nonces
// would need a middleware that sets a per-request nonce (vinext reads it from the request CSP header).
// img2.stibee.com hosts newsletter images, shown in the admin preview. That preview is a sandboxed srcdoc iframe:
// it inherits this policy, and frame-src does not apply to about:srcdoc (no fetch happens), so frame-src stays as is.
// reCAPTCHA entries cover Firebase Auth's optional reCAPTCHA Enterprise check; Google Fonts is imported in globals.css.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://img2.stibee.com",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
  "frame-src https://mecomm-project.firebaseapp.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // Baseline browser protections for every page and API response.
  async headers() {
    return [
      // vinext does not match "/" with "/:path*", so the home page needs its own rule.
      { source: '/', headers: securityHeaders },
      { source: '/:path*', headers: securityHeaders },
      {
        // Pages always revalidate, so a phone that kept an old tab open picks up a new release on reload.
        // Hashed chunks under /_next keep their long immutable cache; API routes set their own no-store.
        source: '/:page(|board|inquiry|complaint|news|clubs|contests|login|signup|verify-email|account|admin|help)',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      { source: '/posts/:id', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/admin/members', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/auth/action', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/newsletter/unsubscribe', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default nextConfig;
