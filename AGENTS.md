<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# House style

Never use em dashes in any output: source code, comments, user-facing copy,
commit messages, docs, or chat. Use a colon, a period, parentheses, or a
rewritten sentence instead. Do not substitute a hyphen, which usually reads
wrong. En dashes are allowed in numeric ranges only, e.g. 10–35.

# Brand

This site is **Prime PEO Brokers**. "Prime Vantage" was a working name used
during Phase 1 and must not appear anywhere. The brand guide is in
`docs/brand/`.

Palette, from the guide: navy `#19233B`, orange `#FF2D00`, white. Colours are
defined once as `--pv-*` tokens in `app/globals.css` and bridged to Tailwind
utilities via `@theme inline`. Change colours there, never inline.

The orange scores about 3.9:1 on white, which fails WCAG AA for normal text.
Use it for buttons with bold white labels, large numerals, and the logo mark.
Body copy and small labels are navy.

Typography deliberately departs from the guide: it specifies Gotham (a paid
Hoefler face) and Arial. We use Archivo for display and Libre Franklin for
body.
