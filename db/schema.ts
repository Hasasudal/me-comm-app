import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable('posts', {
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
 created_at: integer('created_at').notNull(),
 updated_at: integer('updated_at').notNull(),
},table=>[index('idx_posts_status_created').on(table.status,table.created_at)]);

export const attempts=sqliteTable('attempts',{
 key:text('key').primaryKey(),
 count:integer('count').notNull(),
 expires_at:integer('expires_at').notNull(),
},table=>[index('idx_attempts_expiry').on(table.expires_at)]);
