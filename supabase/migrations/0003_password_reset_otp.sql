-- Prime PEO Brokers · OTP password reset and request throttling
--
-- Password reset moves off Supabase's built-in mailer and onto Resend.
--
-- GoTrue still owns identity: admin.generate_link() mints the one-time code and
-- /auth/v1/verify validates it, so auth.uid() and every RLS policy in 0001 keep
-- working untouched. What changes is only who delivers the email.
--
-- Two consequences this migration exists to handle:
--
--   1. Supabase's [auth.rate_limit] email_sent cap protected the reset endpoint
--      from abuse. Sending through Resend removes that protection, so we own it
--      now. Without a limiter, reset becomes an unmetered way to send mail from
--      the brand's verified domain.
--
--   2. Two discovery-flow actions have the same exposure and never had a limit:
--      requestResumeLink emails an arbitrary caller-supplied address, and
--      saveDraft inserts a row per call with the service-role key. Both are
--      unauthenticated. request_throttle below covers all three call sites.
--
-- NOTE ON SECRETS: no one-time code, and no hash of one, is stored in this
-- schema. GoTrue holds the code in auth.one_time_tokens along with its
-- single-use and expiry semantics. The tables here hold only counters keyed on
-- a peppered hash of an identifier. Please do not add a code column later: it
-- would create a credential at rest that the current design does not have.
--
-- Written to be safely re-runnable.

-- ---------------------------------------------------------------------------
-- Reset envelope: one row per identity with a reset in flight
-- ---------------------------------------------------------------------------
create table if not exists public.password_reset_attempts (
  -- HMAC-SHA256 of the lowercased, trimmed email under a server-side pepper.
  -- Computed in Node (lib/auth/reset-otp.ts) so the pepper never reaches the
  -- database: a dump of this table is not a list of staff addresses.
  email_hash         bytea primary key,
  -- Send throttling.
  send_count         integer not null default 0,
  window_started_at  timestamptz not null default now(),
  last_sent_at       timestamptz,
  -- Brute-force control over the code currently outstanding.
  verify_attempts    integer not null default 0,
  locked_until       timestamptz,
  -- Our own expiry, deliberately tighter than GoTrue's otp_expiry. The verify
  -- path checks this first, so the effective code lifetime is this one.
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Generic throttle, used by the unauthenticated discovery actions
-- ---------------------------------------------------------------------------
create table if not exists public.request_throttle (
  -- e.g. 'resume_link', 'save_draft', 'reset_ip'
  scope              text not null,
  -- Peppered hash of whatever identifies the caller for that scope.
  key_hash           bytea not null,
  request_count      integer not null default 0,
  window_started_at  timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (scope, key_hash)
);

-- ---------------------------------------------------------------------------
-- RLS: enabled with no policies at all, matching the stance taken in 0001 for
-- the anon role. Only the service-role client touches these tables, and it
-- bypasses RLS. The absence of policies below is deliberate, not an omission.
-- ---------------------------------------------------------------------------
alter table public.password_reset_attempts enable row level security;
alter table public.request_throttle        enable row level security;

revoke all on public.password_reset_attempts from anon, authenticated;
revoke all on public.request_throttle        from anon, authenticated;

-- ---------------------------------------------------------------------------
-- claim_reset_send: atomically decide whether another code may be sent.
--
-- Check-and-increment happens in a single upsert so concurrent requests
-- serialise on the row lock. Doing this as a select followed by an update from
-- the application would be a race that a burst of parallel calls wins.
-- ---------------------------------------------------------------------------
create or replace function public.claim_reset_send(
  p_email_hash bytea,
  p_ip_hash    bytea default null
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now         timestamptz := now();
  v_window      interval := interval '1 hour';
  v_min_gap     interval := interval '60 seconds';
  v_max_sends   integer := 3;
  v_ttl         interval := interval '15 minutes';
  v_row         public.password_reset_attempts%rowtype;
  v_ip_count    integer;
  v_ip_started  timestamptz;
begin
  -- Per-IP ceiling first, so one caller cannot walk a list of addresses.
  if p_ip_hash is not null then
    insert into public.request_throttle (scope, key_hash, request_count, window_started_at)
    values ('reset_ip', p_ip_hash, 0, v_now)
    on conflict (scope, key_hash) do nothing;

    select request_count, window_started_at
      into v_ip_count, v_ip_started
      from public.request_throttle
     where scope = 'reset_ip' and key_hash = p_ip_hash
       for update;

    if v_ip_started < v_now - v_window then
      v_ip_count := 0;
      v_ip_started := v_now;
    end if;

    if v_ip_count >= 10 then
      return query select false, 'ip_throttled',
        greatest(1, extract(epoch from (v_ip_started + v_window - v_now))::integer);
      return;
    end if;

    update public.request_throttle
       set request_count = v_ip_count + 1,
           window_started_at = v_ip_started,
           updated_at = v_now
     where scope = 'reset_ip' and key_hash = p_ip_hash;
  end if;

  insert into public.password_reset_attempts (email_hash)
  values (p_email_hash)
  on conflict (email_hash) do nothing;

  select * into v_row
    from public.password_reset_attempts
   where email_hash = p_email_hash
     for update;

  -- A lockout from exhausted verify attempts also blocks new sends. Otherwise
  -- an attacker just requests a fresh code and keeps guessing 5 at a time.
  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return query select false, 'locked',
      greatest(1, extract(epoch from (v_row.locked_until - v_now))::integer);
    return;
  end if;

  if v_row.last_sent_at is not null and v_row.last_sent_at > v_now - v_min_gap then
    return query select false, 'too_soon',
      greatest(1, extract(epoch from (v_row.last_sent_at + v_min_gap - v_now))::integer);
    return;
  end if;

  if v_row.window_started_at < v_now - v_window then
    v_row.send_count := 0;
    v_row.window_started_at := v_now;
  end if;

  if v_row.send_count >= v_max_sends then
    return query select false, 'throttled',
      greatest(1, extract(epoch from (v_row.window_started_at + v_window - v_now))::integer);
    return;
  end if;

  -- Allowed: a new code is about to exist, so reset the guess counter and start
  -- our own (tighter than GoTrue's) expiry clock.
  update public.password_reset_attempts
     set send_count = v_row.send_count + 1,
         window_started_at = v_row.window_started_at,
         last_sent_at = v_now,
         verify_attempts = 0,
         locked_until = null,
         expires_at = v_now + v_ttl,
         updated_at = v_now
   where email_hash = p_email_hash;

  return query select true, 'ok', 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_reset_send: give a send back when delivery failed on our side.
--
-- Resend reports failures in its response rather than throwing. If the send did
-- not leave, the user should not lose one of their three attempts for our
-- fault. Safe to expose: an attacker cannot cause a Resend failure on demand.
-- ---------------------------------------------------------------------------
create or replace function public.release_reset_send(p_email_hash bytea)
returns void
language sql
security definer
set search_path = public
as $$
  update public.password_reset_attempts
     set send_count = greatest(0, send_count - 1),
         last_sent_at = null,
         updated_at = now()
   where email_hash = p_email_hash;
$$;

-- ---------------------------------------------------------------------------
-- claim_reset_verify: count a guess, and kill the code once they run out.
--
-- On exhaustion this sets expires_at = now() as well as locking. Locking alone
-- would leave the code valid for whenever the window reopens; expiring it
-- forces a fresh code and resets the attacker's search space.
-- ---------------------------------------------------------------------------
create or replace function public.claim_reset_verify(p_email_hash bytea)
returns table (allowed boolean, attempts_left integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now      timestamptz := now();
  v_max      integer := 5;
  v_lockout  interval := interval '15 minutes';
  v_row      public.password_reset_attempts%rowtype;
begin
  select * into v_row
    from public.password_reset_attempts
   where email_hash = p_email_hash
     for update;

  -- No envelope, expired, or locked: all answer identically so the caller
  -- cannot tell a real account apart from an unknown one.
  if not found
     or v_row.expires_at is null
     or v_row.expires_at <= v_now
     or (v_row.locked_until is not null and v_row.locked_until > v_now) then
    return query select false, 0;
    return;
  end if;

  if v_row.verify_attempts + 1 >= v_max then
    update public.password_reset_attempts
       set verify_attempts = v_max,
           locked_until = v_now + v_lockout,
           expires_at = v_now,
           updated_at = v_now
     where email_hash = p_email_hash;
    -- The final guess is still allowed to be checked; it is simply the last.
    return query select (v_row.verify_attempts + 1 = v_max), 0;
    return;
  end if;

  update public.password_reset_attempts
     set verify_attempts = v_row.verify_attempts + 1,
         updated_at = v_now
   where email_hash = p_email_hash;

  return query select true, (v_max - v_row.verify_attempts - 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- clear_reset_state: called after a code is successfully used.
-- ---------------------------------------------------------------------------
create or replace function public.clear_reset_state(p_email_hash bytea)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.password_reset_attempts where email_hash = p_email_hash;
$$;

-- ---------------------------------------------------------------------------
-- claim_request: the generic limiter for the unauthenticated discovery actions.
-- ---------------------------------------------------------------------------
create or replace function public.claim_request(
  p_scope    text,
  p_key_hash bytea,
  p_max      integer,
  p_window   interval
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_count   integer;
  v_started timestamptz;
begin
  insert into public.request_throttle (scope, key_hash, request_count, window_started_at)
  values (p_scope, p_key_hash, 0, v_now)
  on conflict (scope, key_hash) do nothing;

  select request_count, window_started_at
    into v_count, v_started
    from public.request_throttle
   where scope = p_scope and key_hash = p_key_hash
     for update;

  if v_started < v_now - p_window then
    v_count := 0;
    v_started := v_now;
  end if;

  if v_count >= p_max then
    return query select false,
      greatest(1, extract(epoch from (v_started + p_window - v_now))::integer);
    return;
  end if;

  update public.request_throttle
     set request_count = v_count + 1,
         window_started_at = v_started,
         updated_at = v_now
   where scope = p_scope and key_hash = p_key_hash;

  return query select true, 0;
end;
$$;

-- Only the service-role client calls these.
--
-- Revoking from PUBLIC is the part that matters: Postgres grants EXECUTE on a
-- new function to PUBLIC by default and every role inherits it, so revoking
-- from anon and authenticated alone leaves the function callable with the
-- browser-side anon key. The named roles are listed as well to record intent.
revoke execute on function public.claim_reset_send(bytea, bytea)   from public, anon, authenticated;
revoke execute on function public.release_reset_send(bytea)        from public, anon, authenticated;
revoke execute on function public.claim_reset_verify(bytea)        from public, anon, authenticated;
revoke execute on function public.clear_reset_state(bytea)         from public, anon, authenticated;
revoke execute on function public.claim_request(text, bytea, integer, interval) from public, anon, authenticated;

-- Housekeeping: rows are tiny and self-expiring by logic, but this keeps the
-- tables from growing without bound over years of use.
create index if not exists request_throttle_stale_idx
  on public.request_throttle (window_started_at);
