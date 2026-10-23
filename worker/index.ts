import handler from 'vinext/server/fetch-handler';
import { runScheduledNewsletters } from '../lib/newsletter';

// vinext's own entry handles requests; the cron trigger in wrangler.jsonc sends scheduled newsletters.
export default {
  ...handler,
  scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledNewsletters());
  },
} satisfies ExportedHandler;
