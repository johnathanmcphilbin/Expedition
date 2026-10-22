-- Someone who can't make it to the event (a refused visa, say), with why.
-- Set by an organiser. Their hours can then only go on the shop, which the
-- "what you can spend" budget counts at $5 an hour instead of $8.
alter table users add column if not exists cant_come text;
