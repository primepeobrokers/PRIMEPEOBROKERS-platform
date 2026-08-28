/**
 * Phase 1 runs a single tenant. The id matches the row seeded in
 * supabase/migrations/0001_init.sql. Phase 3 resolves the tenant from the
 * request's subdomain instead of this constant. That is the only call site
 * that should ever need to change.
 */
export const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
