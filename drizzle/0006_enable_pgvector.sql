-- Custom SQL migration file, put your code below! --

-- Enables the pgvector extension this Supabase instance already has
-- available (confirmed via pg_available_extensions this session) but not
-- yet installed. One-time, global — required before PgVector's own
-- automatic per-index DDL (createIndex/upsert) can create vector columns.
CREATE EXTENSION IF NOT EXISTS vector;