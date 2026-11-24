import { api } from '../api-client';

export const NEWSLETTER_OPTIN_KEY = 'micom:newsletter-optin';

// Applies the sign-up newsletter choice once the account exists. The key stays until it works (a pending
// account cannot change settings yet), so the next successful sign-in on this browser applies it.
// ponytail: per browser; signing up on one device and first signing in on another drops the choice (account settings still work).
export async function applyNewsletterOptIn() {
  try {
    if (localStorage.getItem(NEWSLETTER_OPTIN_KEY) !== '1') return;
    await api('/api/account', { newsletter: true }, 'PATCH');
    localStorage.removeItem(NEWSLETTER_OPTIN_KEY);
  } catch {}
}
