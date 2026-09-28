# CONTEXT.md — n-dx.dev

## Project overview

This is the marketing website for [n-dx](https://github.com/en-dash-consulting/n-dx), a spec-driven development toolkit. The site is hosted on GitHub Pages at [n-dx.dev](https://n-dx.dev) with a custom domain configured via `CNAME`.

## Architecture

Static HTML site with no build step and no framework. Pages share `assets/css/site.css` and `assets/js/{sprites,pixel,site}.js`; the landing page adds `home.css`, `home.js`, `iso.js`, and the generated `map-data.js` / `iso-data.js`.

### Files

- `index.html` — Landing page. Boot sequence, hero with the interactive scan map, problems, the pinned four-level loop, tools (character select), feature bento, use cases, comparison table, changelog teaser, install + mini game, contact.
- `changelog/index.html` — Full release history for `@n-dx/core`. **Generated — do not hand-edit.** See "Changelog generation" below.
- `vs/spec-kit/index.html` — Comparison page: n-dx vs Spec Kit, OpenSpec, and Kiro. Served at `/vs/spec-kit/`.
- `mwfb2026/index.html` - Make Work Feel Better Challenge 2026 event landing page for the remote async n-dx challenge. **Unlinked** — still served at its URL, but no longer reachable from the site nav or footer.
- `make-work-feel-better-hackathon-2026/index.html` - Long-slug alias route that redirects to `/mwfb2026/`. Unlinked.
- `hackathon/index.html` - Short alias route that redirects to `/mwfb2026/`. Unlinked.
- `make-work-feel-better/index.html` - Campaign alias route that redirects to `/mwfb2026/`. Unlinked.
- `CNAME` — Custom domain configuration pointing to `n-dx.dev`.

### Design system

Blueprint paper plus an 8-bit layer, after the motion language of heronaiapp.com (rulers, `[01]`
indices, boot counter, text scramble, scroll-lit statements).

- Colors (`site.css` `:root`): `--paper` background, `--ink` text, `--purple` (n-dx brand) and `--teal` (the en-dash) as signals, `--signal`/`--amber` for findings, `--crt` for terminal panels
- Fonts: Geist (uppercase display, body), Geist Mono (labels, code), Silkscreen (pixel accents)
- The isometric views (loop level 1-4, use-case scenes) deliberately use `ndx iso`'s own navy palette and archetype colours, not the site tokens, so they read as the real product
- Pixel art is drawn on `<canvas>` from `assets/js/sprites.js` — never exported images. Add a sprite there and use `<canvas data-sprite="name" data-scale="6">` (optional `data-frames`, `data-fps`, `data-bob`, `data-flip`)
- Motion hooks: `data-reveal`, `data-stagger`, `data-scramble`, `data-count`, `.sweep`, `data-copy`; set `window.ndxCursorLabel` to show a pointer tag (the hero map does)
- Every animation is gated on visibility and disabled under `prefers-reduced-motion`; content is visible without JS
- Responsive breakpoints around 1100px, 960px (loop stops pinning), and 560px

### Third-party integrations

- **Google Fonts** — loaded via CDN
- **Google Analytics** — measurement ID `G-GD4SJX7TSY`
- **Contact form** — links to endash.us contact form with pre-populated fields

### Accessibility

- Skip-to-content link
- ARIA roles and labels on landmarks
- `prefers-reduced-motion` support
- `:focus-visible` outlines
- Color contrast validated

## Changelog generation

`scripts/sync-changelog.mjs` (Node 20+, no dependencies) regenerates the changelog
from two upstream sources and merges them:

| Source | Provides |
|--------|----------|
| `registry.npmjs.org/@n-dx/core` | Which versions actually shipped, and their publish dates |
| `packages/core/CHANGELOG.md` in the core repo | The changeset-authored release notes |

Neither is sufficient alone — the registry has no notes, and the CHANGELOG contains
versions that were never published (`0.4.2`). The script renders the intersection,
and lists versions with no user-facing notes (dependency-only bumps like `0.2.1`,
plus the pre-changesets `0.1.x` line) in a compact "Other releases" tail.

Release badges (Major/Minor/Patch) are derived from the **published version numbers**,
not from the `### … Changes` headings — `0.5.0` shipped as a minor bump while its
CHANGELOG section contains only `### Patch Changes`.

It writes two things:

1. `changelog/index.html` — the full page, rewritten wholesale.
2. Two marked regions in `index.html`, rewritten in place:
   - `<!-- SYNC:HERO_VERSION:… -->` — the hero version pill
   - `<!-- SYNC:LATEST_RELEASES:… -->` — the landing-page changelog section

**The marker comments must stay put** — the script errors out rather than guessing
where the regions go. Anything between a START/END pair is generated; edit the
templates in the script instead.

Run it manually with `node scripts/sync-changelog.mjs`. It is idempotent, so a run
with no upstream publish leaves the working tree clean.

`.github/workflows/sync-changelog.yml` runs it daily at 12:00 UTC, on manual
dispatch, and on a `ndx-release` `repository_dispatch`, committing only when the
output changes. The workflow's trailing comment documents the optional dispatch step
to add to the core repo's release job for near-instant updates.

## CLI commands referenced

The site documents three n-dx CLI commands:
- `ndx analyze .` — runs sourcevision (codebase analysis)
- `ndx recommend .` — runs rex (PRD generation)
- `ndx work .` — runs hench (autonomous task execution)

## Related repositories

- **n-dx (core):** [github.com/en-dash-consulting/n-dx](https://github.com/en-dash-consulting/n-dx)
- **En Dash Consulting:** [endash.us](https://endash.us)
