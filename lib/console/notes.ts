/**
 * Shared shape for internal notes.
 *
 * Separate from the server actions because a "use server" module may only
 * export async functions: a constant or a type exported alongside the actions
 * fails the build. Client components need both, so they live here.
 */

/** The longest note the column accepts, per migration 0005 section 5. */
export const NOTE_MAX = 8000;

export interface NoteView {
  id: number;
  body: string;
  author_name: string;
  created_at: string;
}
