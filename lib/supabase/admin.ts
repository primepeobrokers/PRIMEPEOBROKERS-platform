import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — the ONLY consumer is server-side code
 * that enforces its own guard (the discovery flow's draft-token check).
 * The key never reaches a client bundle: this module is marked server-only
 * and the variable has no NEXT_PUBLIC_ prefix.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
