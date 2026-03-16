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
npx n-dx init .
ndx analyze .
ndx recommend .
ndx work .
```

## This repo

This repository contains the static marketing site for n-dx, hosted on GitHub Pages at [n-dx.dev](https://n-dx.dev).

### Pages

- **`index.html`** — Launch landing page (current default)
- **`ndx-landing.html`** — Post-launch landing page with metrics

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
