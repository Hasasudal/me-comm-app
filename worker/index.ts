import handler from 'vinext/server/fetch-handler';
import { purgeExpiredRecords } from '../lib/member-auth';
import { runScheduledNewsletters } from '../lib/newsletter';

// vinext's own entry handles requests; the cron trigger in wrangler.jsonc sends scheduled newsletters and drops
// records past the privacy policy's retention periods.
export default {
  ...handler,
  scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledNewsletters());
    ctx.waitUntil(purgeExpiredRecords());
  },
} satisfies ExportedHandler;
