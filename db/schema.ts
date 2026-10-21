import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    password_hash: text('password_hash').notNull(),
    salt: text('salt').notNull(),
    status: text('status').notNull(),
    recruitment_status: text('recruitment_status'),
    deadline: text('deadline'),
    headcount: integer('headcount'),
    roles: text('roles'),
    author_id: text('author_id'),
    author_name: text('author_name'),
    prefix: text('prefix'),
    club_id: text('club_id'),
    feedback: text('feedback'),
    resolved_at: integer('resolved_at'),
    pinned_at: integer('pinned_at'),
    // When the latest review decision was made; the writer's "새 결과" badge compares this, not updated_at.
    reviewed_at: integer('reviewed_at'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_posts_status_created').on(table.status, table.created_at),
    index('idx_posts_author').on(table.author_id, table.created_at),
    index('idx_posts_club').on(table.club_id, table.created_at),
    // Board lists (category + status, newest first) and waiting counts (category IN (...) AND resolved_at IS NULL).
    index('idx_posts_category_created').on(table.category, table.created_at),
  ],
);

export const attempts = sqliteTable(
  'attempts',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expires_at: integer('expires_at').notNull(),
  },
  (table) => [index('idx_attempts_expiry').on(table.expires_at)],
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    display_name: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    // member | academic (학사) | council (학생회) | admin; admins assign roles.
    role: text('role').notNull().default('member'),
    suspended_at: integer('suspended_at'),
    // Newsletter subscription (on by default; members turn it off) and the random unsubscribe token, made lazily.
    newsletter: integer('newsletter').notNull().default(1),
    newsletter_token: text('newsletter_token'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_users_email').on(table.email),
    index('idx_users_status').on(table.status),
    uniqueIndex('idx_users_newsletter_token').on(table.newsletter_token),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    token_hash: text('token_hash').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: integer('created_at').notNull(),
    expires_at: integer('expires_at').notNull(),
  },
  (table) => [index('idx_sessions_user').on(table.user_id), index('idx_sessions_expiry').on(table.expires_at)],
);

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    post_id: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    author_id: text('author_id').notNull(),
    author_name: text('author_name').notNull(),
    content: text('content').notNull(),
    created_at: integer('created_at').notNull(),
  },
  (table) => [index('idx_comments_post').on(table.post_id, table.created_at)],
);

// Photos live in R2; this row records who uploaded each one and which post (if any) it belongs to.
export const images = sqliteTable(
  'images',
  {
    key: text('key').primaryKey(),
    owner_id: text('owner_id').notNull(),
    post_id: text('post_id'),
    position: integer('position').notNull().default(0),
    created_at: integer('created_at').notNull(),
  },
  (table) => [index('idx_images_post').on(table.post_id, table.position)],
);

// Who changed whose role or status, and when. Names and emails are copied so the record outlives the accounts.
export const memberAudit = sqliteTable(
  'member_audit',
  {
    id: text('id').primaryKey(),
    actor_id: text('actor_id').notNull(),
    actor_name: text('actor_name').notNull(),
    target_id: text('target_id').notNull(),
    target_name: text('target_name').notNull(),
    target_email: text('target_email').notNull(),
    action: text('action').notNull(), // 'role' | 'status'
    before: text('before').notNull(),
    after: text('after').notNull(),
    created_at: integer('created_at').notNull(),
  },
  (table) => [index('idx_member_audit_created').on(table.created_at)],
);

// Clubs are requested by members and approved by admins; club posts belong to one through posts.club_id.
export const clubs = sqliteTable(
  'clubs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status').notNull(), // 'pending' | 'active'
    requested_by: text('requested_by'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_clubs_name').on(table.name)],
);

// Admin-written newsletters, mailed in batches through the Apps Script relay. sent_at is set once nothing is pending.
export const newsletters = sqliteTable('newsletters', {
  id: text('id').primaryKey(),
  subject: text('subject').notNull(),
  html: text('html').notNull(),
  created_by: text('created_by').notNull(),
  created_by_name: text('created_by_name').notNull(),
  created_at: integer('created_at').notNull(),
  sent_at: integer('sent_at'),
});

// One row per recipient, snapshotted on the first send call: pending -> sending (claimed) -> sent | failed.
export const newsletterDeliveries = sqliteTable(
  'newsletter_deliveries',
  {
    newsletter_id: text('newsletter_id').notNull(),
    user_id: text('user_id').notNull(),
    email: text('email').notNull(),
    status: text('status').notNull(),
    error: text('error'),
    // Claim time while 'sending', delivery time once 'sent'.
    sent_at: integer('sent_at'),
  },
  (table) => [
    primaryKey({ columns: [table.newsletter_id, table.user_id] }),
    index('idx_newsletter_deliveries_status').on(table.newsletter_id, table.status),
  ],
);
