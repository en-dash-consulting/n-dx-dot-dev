# CONTEXT.md — n-dx.dev

## Project overview

This is the marketing website for [n-dx](https://github.com/en-dash-consulting/n-dx), a spec-driven development toolkit. The site is hosted on GitHub Pages at [n-dx.dev](https://n-dx.dev) with a custom domain configured via `CNAME`.

## Architecture

Static HTML site with no build step. Each page is a single self-contained HTML file with inline CSS and no JavaScript framework.

### Files

- `index.html` — Launch landing page. This is what GitHub Pages serves at the root URL. Contains hero, package cards, problem section, how-it-works terminal demo, use cases, personas, comparison table, install CTA, and contact section.
- `ndx-landing.html` — Post-launch variant. Same structure as index.html but adds a metrics bar section for displaying traction numbers.
- `CNAME` — Custom domain configuration pointing to `n-dx.dev`.

### Design system

CSS custom properties define the visual language:
- Colors: `--navy` (background), `--teal` (primary accent), `--purple` (secondary), `--amber` (tertiary)
- Fonts: Montserrat (display), DM Sans (body), DM Mono (code/labels)
- Responsive breakpoints at 900px (tablet) and 480px (phone)

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

## CLI commands referenced

The site documents three n-dx CLI commands:
- `ndx analyze .` — runs sourcevision (codebase analysis)
- `ndx recommend .` — runs rex (PRD generation)
- `ndx work .` — runs hench (autonomous task execution)

## Related repositories

- **n-dx (core):** [github.com/en-dash-consulting/n-dx](https://github.com/en-dash-consulting/n-dx)
- **En Dash Consulting:** [endash.us](https://endash.us)
