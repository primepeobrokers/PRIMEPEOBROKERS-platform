-- Prime PEO Brokers · rebrand and category-first discovery
--
-- Two changes:
--   1. The tenant seeded in 0001 carried the working name "Prime Vantage".
--      The real brand is Prime PEO Brokers.
--   2. Discovery now opens with a category choice, and the home page offers a
--      second entry point for renewal benchmarking. Both belong on the lead.
--
-- Written to be safely re-runnable.

update public.tenants
   set slug = 'prime-peo-brokers',
       name = 'Prime PEO Brokers'
 where id = '00000000-0000-4000-8000-000000000001';

alter table public.submissions
  -- Which market the visitor is shopping: peo, payroll, hris, recruiting,
  -- performance, learning. Null on drafts started before this migration.
  add column if not exists category text,
  -- How they arrived: 'shop' is the default discovery, 'renewal' is the
  -- benchmark-my-existing-deal path off the home page.
  add column if not exists intent text not null default 'shop';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'submissions_intent_check'
  ) then
    alter table public.submissions
      add constraint submissions_intent_check
      check (intent in ('shop', 'renewal'));
  end if;
end $$;

-- The console segments by category first, so index it alongside the tenant.
create index if not exists submissions_tenant_category_idx
  on public.submissions (tenant_id, category);

-- Records that predate the category step keep whatever the answers jsonb says.
update public.submissions
   set category = answers ->> 'category'
 where category is null
   and answers ->> 'category' is not null;

comment on column public.submissions.category is
  'Product category the visitor selected in step 1 of discovery.';
comment on column public.submissions.intent is
  'shop = standard discovery, renewal = benchmarking an existing deal.';
