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

# Git

Stage work with `git add`, then stop. Never commit, and never push.

The user reviews the staged diff and writes the commit themselves. Leaving work
staged but uncommitted is the finished state, not an unfinished one, so do not
offer to commit or treat a clean `git status` as the goal.

# Skills

Load both of these before any frontend work, and follow them over habit:

- `ui-ux-pro-max` (also listed as `anthropic-skills:ui-ux-pro-max`)
- `impeccable`

"Frontend work" means any change to a page, component, layout, style, token or
piece of user-facing copy. It does not mean a server action, a migration, or a
script. When in doubt, load them: the cost of reading a skill is far lower than
shipping a page that looks templated.

# React, TypeScript and JavaScript

Match the surrounding code first. These are the conventions this repo already
follows, not new rules:

- Server Components by default. Add `"use client"` only for state, effects, or
  event handlers, and push it to the smallest leaf that needs it. A `"use
  client"` near the top of a tree pulls everything below it into the bundle.
- Type the domain, not the framework. Props and return types are explicit;
  inference is fine for locals. No `any`, and no non-null `!` to silence a
  check that is telling the truth.
- Derive state instead of storing it. A value computable from props or existing
  state is not state, and a second copy of it is a bug waiting to happen.
- `useEffect` is for synchronising with something outside React. It is not for
  deriving values, and not for reacting to a prop change that could be handled
  during render.
- Keys are stable ids from the data, never the array index.
- Validate on the server even when the client already did. Client validation is
  a convenience; the server action is the boundary that has to hold.
- Reuse what exists before adding anything. This repo has a token system, a
  schema that drives the whole discovery flow, and shared helpers in `lib/`.
  Check there first.
