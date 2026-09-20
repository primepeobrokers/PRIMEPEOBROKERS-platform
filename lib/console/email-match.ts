/**
 * Matching an email address safely in a PostgREST filter.
 *
 * WHY THIS IS NOT IN THE ACTIONS FILE
 *
 * app/console/partners/actions.ts is `"use server"`, where every export must
 * be an async server action. These two are pure and need unit tests, so they
 * live here and are imported there.
 *
 * WHAT THEY GUARD
 *
 * An address typed into the Partners screen reaches a `.ilike()` filter, and
 * in a LIKE pattern `%` and `_` are wildcards, not literals. So
 * `%@partner.com` is a syntactically valid-looking address that matches an
 * arbitrary OTHER user on the tenant, and the resend path would mail that
 * person a working sign-in link.
 *
 * Both locks are kept on purpose: the regex refuses the characters at the
 * door, and escapeLike neutralises them at the query. Either alone would do,
 * and a future caller that forgets one still has the other.
 */

/**
 * A deliberately strict address test.
 *
 * `%` and `_` are excluded for the reason above, not because they are invalid
 * in an email local part (RFC 5322 permits both). The trade is accepted: an
 * address containing either cannot be invited from this screen, and nobody
 * has one.
 */
export const CONSOLE_EMAIL_RE = /^[^@\s%_]+@[^@\s.%_]+\.[^@\s%_]+$/;

/**
 * Neutralises LIKE wildcards for PostgREST's `ilike`, which uses backslash as
 * the escape character.
 *
 * The backslash itself is escaped first, otherwise escaping `%` would produce
 * a backslash that the next replacement could consume.
 */
export function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}
