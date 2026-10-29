-- Making the first administrator. Run in the Supabase SQL editor, in two
-- parts, against the project you are setting up. See docs/setup.md.
--
-- This is the one deliberate way to become an admin. There is no API for it,
-- so nobody can grant themselves the role from the site.

-- PART 1 -- before registering. Lets your address past the invitation gate.
insert into public.tester_access (email, status, source, note)
values (lower('YOU@EXAMPLE.COM'), 'invited', 'bootstrap', 'first administrator')
on conflict (email) do nothing;

-- Now register on the site with that address, confirm the email, sign in,
-- and choose a username.

-- PART 2 -- after your profile exists.
update public.profiles
   set role = 'admin', updated_at = now()
 where user_id = (select id from auth.users where lower(email) = lower('YOU@EXAMPLE.COM'));

-- check
select p.username, p.role, u.email
  from public.profiles p join auth.users u on u.id = p.user_id
 where p.role = 'admin';
