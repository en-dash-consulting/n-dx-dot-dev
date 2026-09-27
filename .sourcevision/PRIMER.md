<!-- sourcevision-primer fingerprint: 05014ccd3e2c8170 -->

This is n-dx.dev, the static marketing site for the n-dx CLI toolkit, hosted on GitHub Pages.

## Primer

**Layout.** This is a static HTML site with no build pipeline. There's no `src`/`test` split — production content is the top-level `.html` pages (`index.html`, `changelog/index.html`, `vs/spec-kit/index.html`) plus a handful of unlinked-but-live campaign pages (`mwfb2026/`, `hackathon/`, `make-work-feel-better/`, `make-work-feel-better-hackathon-2026/` — the latter three just redirect into `mwfb2026/`). The only executable code is `scripts/sync-changelog.mjs`, a single Node script with no test suite anywhere in the repo. `CNAME` configures the custom domain for GitHub Pages.

**Build and test.** There is no build step and no test command. The one runnable piece of logic is the changelog generator:

node scripts/sync-changelog.mjs

Requires Node 20+, no dependencies (no `package.json`, no npm install). It's idempotent — running it with nothing new upstream leaves the working tree clean. In CI, `.github/workflows/sync-changelog.yml` runs this daily at 12:00 UTC, on manual dispatch, and on an `ndx-release` `repository_dispatch` event, then opens a PR against the branch it ran on (it never pushes directly, since `main` is protected by an org-level ruleset requiring PRs).

**Conventions.** Plain HTML with inline CSS per page — no JS framework, no CSS build. The script is plain ESM Node (`.mjs`), zero dependencies by design; don't reach for npm packages here. CSS custom properties (`--navy`, `--teal`, `--purple`, `--amber`) define the color system, with Montserrat/DM Sans/DM Mono from Google Fonts. Accessibility conventions are already in place site-wide (skip-to-content link, ARIA landmarks, `prefers-reduced-motion`, `:focus-visible`) — preserve them when touching markup.

**What would waste a newcomer's first hour.**
- `changelog/index.html`, and the two `<!-- SYNC:HERO_VERSION:… -->` / `<!-- SYNC:LATEST_RELEASES:… -->` regions inside `index.html`, are generated output. Hand-editing them is pointless — the next script run overwrites it. Change the templates inside `sync-changelog.mjs` instead, and don't move or remove the `SYNC` marker comments — the script errors out rather than guessing where the regions go.
- The changelog is a merge of two sources (npm registry publish data + the changeset notes in the core repo's `packages/core/CHANGELOG.md`) because neither alone is sufficient — the registry has no notes, and the CHANGELOG lists versions that were never actually published. Release badges (Major/Minor/Patch) come from the published version number, not from the CHANGELOG's `### … Changes` heading — those can disagree.
- Several route directories (`mwfb2026/`, `hackathon/`, etc.) look abandoned but are intentionally still live at their URLs; they're just unlinked from site nav/footer.
- `main` can't be pushed to directly — even the automated sync goes through a PR.

- Nothing to act on — this was a documentation request; primer is delivered above.
