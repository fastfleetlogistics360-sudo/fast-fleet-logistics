-- Run this file by itself in the Supabase SQL Editor, before 202609050001.
-- PostgreSQL requires a newly added enum value to commit before any later
-- statement in another migration can use that value.
alter type public.user_role add value if not exists 'investor';
