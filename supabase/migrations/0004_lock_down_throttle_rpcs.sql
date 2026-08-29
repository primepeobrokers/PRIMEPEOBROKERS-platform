-- Prime PEO Brokers · restrict the throttle functions to the service role
--
-- 0003 revoked EXECUTE from anon and authenticated, which was not enough.
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and every
-- role inherits from PUBLIC, so revoking from the named roles left the
-- inherited grant in place. Verified against production: the anon key, which
-- ships in the browser bundle, could call claim_reset_verify directly.
--
-- That is a lockout primitive. The email hash is the only argument, so anyone
-- who guesses a staff address could burn its five verify attempts and deny
-- that person password recovery for fifteen minutes, repeatedly.
--
-- These functions are security definer and are only ever called from server
-- code holding the service-role key. Revoking from PUBLIC is the correct
-- boundary; the explicit anon/authenticated revokes are kept as documentation
-- of intent.
--
-- Written to be safely re-runnable.

revoke execute on function public.claim_reset_send(bytea, bytea)
  from public, anon, authenticated;
revoke execute on function public.release_reset_send(bytea)
  from public, anon, authenticated;
revoke execute on function public.claim_reset_verify(bytea)
  from public, anon, authenticated;
revoke execute on function public.clear_reset_state(bytea)
  from public, anon, authenticated;
revoke execute on function public.claim_request(text, bytea, integer, interval)
  from public, anon, authenticated;

-- current_tenant_id() has the same latent exposure. It is security definer and
-- reads auth.uid(), so an anon caller gets null rather than another tenant's
-- id, but there is no reason for it to be callable from the browser at all.
revoke execute on function public.current_tenant_id() from public, anon;
