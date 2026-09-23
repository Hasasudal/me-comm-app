import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_posts_status_created').on(table.status, table.created_at),
    index('idx_posts_author').on(table.author_id, table.created_at),
    index('idx_posts_club').on(table.club_id, table.created_at),
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
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_users_email').on(table.email), index('idx_users_status').on(table.status)],
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
