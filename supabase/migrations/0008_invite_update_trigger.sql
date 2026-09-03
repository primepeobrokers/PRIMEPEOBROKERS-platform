-- ===========================================================================
-- 0008: create the profile when the invite stamp lands, not only at insert
--
-- THE HOLE 0007 OPENED
--
-- 0007 made handle_new_user() refuse to create a profile unless
-- new.invited_at is set, which is right: membership must be invite-only.
-- But the trigger fires AFTER INSERT, and GoTrue's invite flow turns out to
-- be two statements: it inserts the auth user first and stamps invited_at in
-- a follow-up update, 48ms later on the live project (verified on user
-- b5dd5972, created_at 17:24:30.901 vs invited_at 17:24:30.949).
--
-- So the insert-time trigger saw invited_at as null, skipped the profile,
-- and the invitee was left able to accept the invite and sign in to an
-- account with no tenant: getSessionContext() returns null, /console
-- redirects to /login, the proxy sees a valid session and redirects back. A
-- redirect loop, for exactly the people the team screen invites.
--
-- THE FIX
--
-- Fire the same function when invited_at transitions from null to a value.
-- handle_new_user() already ends in `on conflict (id) do nothing`, so on a
-- GoTrue version that stamps invited_at inside the insert itself, the pair
-- of triggers is still safe: whichever fires second is a no-op.
--
-- The security posture is unchanged. invited_at is still GoTrue-owned and
-- still unreachable from a self-signup request; this only moves WHEN the
-- gate is evaluated, not what it checks.
--
-- The one profile stranded by the gap (Muhammad Junaid, member) was repaired
-- by hand before this migration was written.
--
-- Safely re-runnable.
-- ===========================================================================

drop trigger if exists on_auth_user_invited on auth.users;

create trigger on_auth_user_invited
  after update of invited_at on auth.users
  for each row
  when (old.invited_at is null and new.invited_at is not null)
  execute function public.handle_new_user();
