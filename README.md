# n-dx.dev

Marketing site for [n-dx](https://github.com/en-dash-consulting/n-dx) — the spec-driven development toolkit that connects codebase analysis, structured planning, and autonomous task execution into one repeatable loop.

**Live site:** [n-dx.dev](https://n-dx.dev)

## What is n-dx?

n-dx is an open-source CLI toolkit for spec-driven development. It closes the loop between understanding a codebase and shipping work against a structured plan.

Three packages, three commands:

| Package | Command | Purpose |
|---------|---------|---------|
| **sourcevision** | `ndx analyze .` | Static analysis — file inventory, import graph, architectural zones, component catalog |
| **rex** | `ndx recommend .` | PRD management — generates epics, features, tasks, and dependencies from codebase context |
| **hench** | `ndx work .` | Autonomous execution — picks the next task, builds a brief, drives Claude in a tool-use loop |

The PRD is the source of truth. Every cycle begins with understanding what's in the code and ends with shipped work.

**Get started:**

```bash
npm i -g @n-dx/core
ndx init .
ndx analyze .
ndx recommend --accept .
ndx work --auto .
```

## This repo

This repository contains the static marketing site for n-dx, hosted on GitHub Pages at [n-dx.dev](https://n-dx.dev).

### Pages

- **`index.html`** — Landing page (served at the root URL)
- **`changelog/index.html`** — Release history for `@n-dx/core` ([n-dx.dev/changelog](https://n-dx.dev/changelog/)) — generated, see below
- **`mwfb2026/index.html`** - Make Work Feel Better Challenge 2026 landing page
- **`make-work-feel-better-hackathon-2026/index.html`** - Alias route that redirects to `/mwfb2026/`
- **`hackathon/index.html`** - Short alias route that redirects to `/mwfb2026/`
- **`make-work-feel-better/index.html`** - Campaign alias route that redirects to `/mwfb2026/`

### Changelog

The changelog is generated, not written here. `scripts/sync-changelog.mjs` merges the
npm registry (which versions shipped, and when) with the changeset-authored notes in
the core repo's `packages/core/CHANGELOG.md`, then rewrites `changelog/index.html` and
the two `<!-- SYNC:… -->` regions in `index.html`.

```bash
node scripts/sync-changelog.mjs   # Node 20+, no dependencies
```

`.github/workflows/sync-changelog.yml` runs it daily and on demand, committing only
when the output changes. To make the site update within seconds of a publish instead
of within a day, add a `repository_dispatch` step to the core repo's release job — the
workflow file documents the exact snippet.

Don't hand-edit `changelog/index.html` or anything between the `SYNC` markers; the
next run overwrites it. Change the templates in the script instead.

### Stack

- Static HTML with inline CSS — no build step, no dependencies
- Google Fonts (Montserrat, DM Sans, DM Mono)
- Google Analytics (gtag.js)
- Hosted via GitHub Pages with custom domain

## Links

- **n-dx core repo:** [github.com/en-dash-consulting/n-dx](https://github.com/en-dash-consulting/n-dx)
- **Built by En Dash Consulting:** [endash.us](https://endash.us)
- **Live site:** [n-dx.dev](https://n-dx.dev)

## License

Elastic License 2.0
