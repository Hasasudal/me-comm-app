-- The academic Q&A board was removed; its posts and their comments are deleted (photos did not exist yet).
DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE category = 'qna');--> statement-breakpoint
DELETE FROM posts WHERE category = 'qna';
