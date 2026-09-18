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
    feedback: text('feedback'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_posts_status_created').on(table.status, table.created_at),
    index('idx_posts_author').on(table.author_id, table.created_at),
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

export const adminUsers = sqliteTable(
  'admin_users',
  {
    user_id: text('user_id').primaryKey(),
    email: text('email').notNull(),
    display_name: text('display_name').notNull(),
    joined_at: integer('joined_at').notNull(),
    revoked_at: integer('revoked_at'),
  },
  (table) => [index('idx_admin_users_active').on(table.revoked_at)],
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    display_name: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
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
