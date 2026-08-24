import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Session-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers. Uses the publishable (anon) key — all reads go through RLS,
 * so an authenticated staff user can only ever see their own tenant's rows.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — session refresh is handled by
            // the proxy, so writes here can be safely ignored.
          }
        },
      },
    },
  );
}
