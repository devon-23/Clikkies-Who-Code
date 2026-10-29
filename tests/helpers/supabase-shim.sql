-- Just enough of a Supabase database for the migrations to apply inside
-- PGlite: the roles Supabase creates and the slice of auth.users we touch.
-- Test-only. Never run this against a real project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role supabase_auth_admin nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
