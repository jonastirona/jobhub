-- 016_add_jobs_research
-- Adds a column to store AI-generated company research on the job card
 
alter table if exists jobs
add column if not exists research text;
 
-- Optional: Add a GIN index for full-text search on research content
-- create index if not exists jobs_research_search_idx on jobs using gin(to_tsvector('english', research));