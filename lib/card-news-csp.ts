// No imports: next.config.ts reads this too.
// The uploaded page runs in an opaque origin (CSP sandbox without allow-same-origin), so it cannot read our cookies
// or call our API as the viewer, even when opened directly. It may load https images, fonts, styles and scripts,
// since card news usually pulls fonts from a CDN; it cannot fetch, submit forms or navigate the top page.
export const cardNewsCsp = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox',
  "default-src 'none'",
  'img-src https: data: blob:',
  'media-src https: data: blob:',
  "style-src 'unsafe-inline' https:",
  'font-src https: data:',
  "script-src 'unsafe-inline' https:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');
