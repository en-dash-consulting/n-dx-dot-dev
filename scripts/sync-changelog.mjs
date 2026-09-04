#!/usr/bin/env node
// Regenerates changelog/index.html and the changelog regions of index.html from
// the two upstream sources of truth:
//
//   1. registry.npmjs.org/@n-dx/core  — which versions actually shipped, and when
//   2. packages/core/CHANGELOG.md     — the Changesets-generated release notes
//
// Neither source is sufficient alone. The registry knows publish dates but has no
// notes; the CHANGELOG has notes but also contains versions that were never
// published (0.4.2). We render the intersection, then list registry-only versions
// (0.1.x, published before the repo adopted Changesets) as a compact tail.
//
// No dependencies — Node 20+ for global fetch.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const PKG = '@n-dx/core'
const REGISTRY = `https://registry.npmjs.org/${encodeURIComponent(PKG)}`
const CHANGELOG =
  'https://raw.githubusercontent.com/en-dash-consulting/n-dx/main/packages/core/CHANGELOG.md'
const REPO = 'https://github.com/en-dash-consulting/n-dx'
const NPM_PAGE = `https://www.npmjs.com/package/${PKG}`

// Releases shown as cards on the landing page.
const FRONT_PAGE_COUNT = 3
// Bullets shown per release on a landing-page card.
const FRONT_PAGE_BULLETS = 2

// ── fetch ──────────────────────────────────────────────────────────────────

async function get(url, as) {
  const res = await fetch(url, { headers: { 'user-agent': 'n-dx.dev changelog sync' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return as === 'json' ? res.json() : res.text()
}

// ── markdown ───────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const BACKTICK = String.fromCharCode(96)
const NUL = String.fromCharCode(0)

// Inline markdown → HTML. Escape first so every body is already safe, then pull
// code spans out to placeholders before the emphasis pass: the notes are full of
// globs like `.claude/skills/**/*.md`, and a bold pass that could see inside a
// code span would pair those asterisks with a later span's and swallow the tags
// between them.
function inline(md) {
  const code = []
  let out = esc(md).replace(
    new RegExp(`${BACKTICK}([^${BACKTICK}]+)${BACKTICK}`, 'g'),
    (_, body) => `${NUL}${code.push(body) - 1}${NUL}`
  )

  out = out
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, text, url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  return out.replace(
    new RegExp(`${NUL}(\\d+)${NUL}`, 'g'),
    (_, i) => `<code>${code[Number(i)]}</code>`
  )
}

// A run of lines that are all markdown bullets becomes a list; anything else
// collapses its soft line wraps into one flowing paragraph.
function renderText(paragraph) {
  const lines = paragraph.split('\n').filter((l) => l.trim())
  const bulleted = lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l))
  if (bulleted) {
    const items = lines
      .map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`)
      .join('')
    return `<ul class="cl-sublist">${items}</ul>`
  }
  return `<p>${inline(lines.join(' '))}</p>`
}

function renderBlock(b) {
  if (b.type === 'code') {
    return `<pre class="cl-code"><code>${esc(b.content)}</code></pre>`
  }
  return renderText(b.content)
}

// Split an entry body into typed blocks. Fenced code is carved out first so its
// blank lines don't get treated as paragraph breaks and its contents never reach
// the inline renderer.
function splitBlocks(body) {
  const blocks = []
  const fence = new RegExp(`^ *${BACKTICK.repeat(3)}(\\w*) *\\n([\\s\\S]*?)^ *${BACKTICK.repeat(3)} *$`, 'gm')

  const pushText = (chunk) => {
    for (const p of chunk.split(/\n[ \t]*\n/)) {
      const t = p.trim()
      if (t) blocks.push({ type: 'text', content: t })
    }
  }

  let last = 0
  let m
  while ((m = fence.exec(body)) !== null) {
    pushText(body.slice(last, m.index))
    blocks.push({ type: 'code', lang: m[1] || '', content: m[2].replace(/\s+$/, '') })
    last = m.index + m[0].length
  }
  pushText(body.slice(last))

  return blocks
}

// ── CHANGELOG parsing ──────────────────────────────────────────────────────

// Strip the Changesets attribution prefix — "[#346](url) [`sha`](url) Thanks
// [@user](url)! - " — and keep what it tells us. Older entries omit the Thanks
// clause, and the oldest omit the prefix entirely.
const WITH_THANKS =
  /^(?:\[#(\d+)\]\(([^)\s]+)\)\s*)?(?:\[`([^`]+)`\]\(([^)\s]+)\)\s*)?Thanks \[@([^\]]+)\]\(([^)\s]+)\)!\s*-\s*/
const WITHOUT_THANKS =
  /^\[#(\d+)\]\(([^)\s]+)\)\s*(?:\[`([^`]+)`\]\(([^)\s]+)\)\s*)?!?\s*-\s*/

function parseEntry(raw) {
  // Continuation lines are indented two spaces by Changesets; nested lists more.
  const dedented = raw
    .split('\n')
    .map((l) => l.replace(/^ {1,2}/, ''))
    .join('\n')
    .trim()

  let body = dedented
  let pr = null
  let prUrl = null
  let author = null
  let authorUrl = null

  const m = dedented.match(WITH_THANKS) || dedented.match(WITHOUT_THANKS)
  if (m) {
    body = dedented.slice(m[0].length).trim()
    pr = m[1] || null
    prUrl = m[2] || null
    // Only the WITH_THANKS shape carries an author, in groups 5/6.
    if (m.length > 5) {
      author = m[5] || null
      authorUrl = m[6] || null
    }
  }

  const blocks = splitBlocks(body)
  // The headline is the first prose block, never a code fence, so a card blurb
  // can't end up being a snippet of JSON.
  const lead = blocks.findIndex((b) => b.type === 'text')

  return {
    // Dependency bumps are real but not news — they'd bury the actual changes.
    isDeps: /^Updated dependencies/i.test(body),
    pr,
    prUrl,
    author,
    authorUrl,
    summary: lead === -1 ? '' : blocks[lead].content,
    detail: blocks.filter((_, i) => i !== lead),
  }
}

function parseChangelog(md) {
  const releases = []
  let release = null
  let bump = null
  let buffer = null

  const flush = () => {
    if (release && buffer !== null) {
      const entry = parseEntry(buffer)
      if (!entry.isDeps && entry.summary) release.entries.push({ ...entry, bump })
    }
    buffer = null
  }

  for (const line of md.split('\n')) {
    const version = line.match(/^## +(\S+)/)
    if (version) {
      flush()
      release = { version: version[1], entries: [] }
      releases.push(release)
      bump = null
      continue
    }
    const heading = line.match(/^### +(\w+) Changes/)
    if (heading) {
      flush()
      bump = heading[1] // Major | Minor | Patch
      continue
    }
    if (/^- /.test(line)) {
      flush()
      buffer = line.slice(2)
      continue
    }
    if (buffer !== null) buffer += '\n' + line
  }
  flush()

  return releases.filter((r) => /^\d+\.\d+\.\d+/.test(r.version))
}

// ── formatting helpers ─────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(iso) {
  const d = new Date(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

const anchor = (version) => `v${version.replace(/\./g, '-')}`

// Strip inline markdown to plain text, for card blurbs and meta descriptions.
function plain(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${cut.slice(0, at > max * 0.6 ? at : max).replace(/[,.;:—-]$/, '')}…`
}

// The release badge comes from the published version numbers, not from the
// changeset headings — 0.5.0 shipped as a minor bump while its CHANGELOG section
// contains only "### Patch Changes", so the headings describe individual
// changesets rather than the release they landed in.
function releaseBump(release) {
  const prev = release.previous
  if (!prev) return 'Patch'
  const [a, b] = [release.version, prev].map((v) => v.split('.').map(Number))
  if (a[0] !== b[0]) return 'Major'
  if (a[1] !== b[1]) return 'Minor'
  return 'Patch'
}

// ── page generation ────────────────────────────────────────────────────────

function renderEntry(entry) {
  const detail = entry.detail.length
    ? `<details class="cl-detail"><summary>Read more</summary><div class="cl-detail-body">${entry.detail
        .map(renderBlock)
        .join('')}</div></details>`
    : ''

  const meta = []
  if (entry.pr && entry.prUrl) {
    meta.push(
      `<a class="cl-pr" href="${esc(entry.prUrl)}" target="_blank" rel="noopener noreferrer">#${esc(entry.pr)}</a>`
    )
  }
  if (entry.author && entry.authorUrl) {
    meta.push(
      `<a class="cl-author" href="${esc(entry.authorUrl)}" target="_blank" rel="noopener noreferrer">@${esc(entry.author)}</a>`
    )
  }

  return `<li class="cl-entry">
          <div class="cl-entry-head">
            <span class="cl-bump ${entry.bump ? entry.bump.toLowerCase() : 'patch'}">${esc(entry.bump || 'Patch')}</span>
            ${meta.length ? `<span class="cl-entry-meta">${meta.join('<span class="cl-sep">·</span>')}</span>` : ''}
          </div>
          <div class="cl-entry-body">${renderText(entry.summary)}${detail}</div>
        </li>`
}

function renderRelease(release) {
  return `<article class="cl-release" id="${anchor(release.version)}">
        <header class="cl-release-head">
          <h2 class="cl-version">
            <a href="#${anchor(release.version)}" aria-label="Permalink to ${esc(release.version)}">${esc(release.version)}</a>
          </h2>
          <time class="cl-date" datetime="${esc(release.published)}">${esc(formatDate(release.published))}</time>
          <span class="cl-release-bump ${releaseBump(release).toLowerCase()}">${releaseBump(release)}</span>
          <a class="cl-npm-link" href="${NPM_PAGE}/v/${esc(release.version)}" target="_blank" rel="noopener noreferrer">npm ↗</a>
        </header>
        <ul class="cl-entries" role="list">
${release.entries.map(renderEntry).join('\n')}
        </ul>
      </article>`
}

function buildChangelogPage(releases, early, latest) {
  const headline = truncate(plain(releases[0].entries[0].summary), 150)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-GD4SJX7TSY"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-GD4SJX7TSY');
</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Changelog — n-dx</title>
<meta name="description" content="Release notes for @n-dx/core. Latest: v${esc(latest)} — ${esc(headline)}">
<meta name="author" content="En Dash Consulting">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://n-dx.dev/changelog/">
<meta name="theme-color" content="#0d1b3e">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://n-dx.dev/changelog/">
<meta property="og:title" content="Changelog — n-dx">
<meta property="og:description" content="Release notes for @n-dx/core. Latest: v${esc(latest)} — ${esc(headline)}">
<meta property="og:image" content="https://n-dx.dev/n-dx-logo.png">
<meta property="og:image:width" content="300">
<meta property="og:image:height" content="300">
<meta property="og:image:alt" content="n-dx logo">
<meta property="og:site_name" content="n-dx">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Changelog — n-dx">
<meta name="twitter:description" content="Release notes for @n-dx/core. Latest: v${esc(latest)}">
<meta name="twitter:image" content="https://n-dx.dev/n-dx-logo.png">
<meta name="twitter:image:alt" content="n-dx logo">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Montserrat:wght@400;600;700;800;900&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="/n-dx-logo.png">
<link rel="apple-touch-icon" href="/n-dx-logo.png">
<style>
  :root {
    --navy: #0d1b3e;
    --navy-mid: #132247;
    --navy-light: #1a2f5a;
    --teal: #00ffb3;
    --teal-dim: #1a9970;
    --teal-subtle: rgba(45,212,160,0.12);
    --amber: #ffaa33;
    --amber-subtle: rgba(245,158,66,0.12);
    --purple: #a78bff;
    --purple-subtle: rgba(139,124,248,0.12);
    --white: #ffffff;
    --muted: #dde6f8;
    --border: rgba(255,255,255,0.10);
    --card: rgba(255,255,255,0.05);
    --card-hover: rgba(255,255,255,0.09);
    --font-display: 'Montserrat', sans-serif;
    --font-body: 'DM Sans', sans-serif;
    --font-mono: 'DM Mono', monospace;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html { scroll-behavior: smooth; }

  body {
    background: var(--navy);
    color: #edf2ff;
    font-family: var(--font-body);
    font-weight: 400;
    line-height: 1.7;
    overflow-x: hidden;
  }

  /* ── NAV ─────────────────────────────────────────────────────────── */
  nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 48px;
    height: 64px;
    background: rgba(13,27,62,0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .nav-logo-mark { width: 32px; height: 32px; border-radius: 7px; overflow: hidden; flex-shrink: 0; }
  .nav-logo-mark img { width: 100%; height: 100%; object-fit: cover; }
  .nav-logo-text {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--white);
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .nav-links { display: flex; gap: 32px; list-style: none; flex-wrap: nowrap; }
  .nav-links a {
    white-space: nowrap;
    color: var(--muted);
    text-decoration: none;
    font-size: 1rem;
    font-weight: 400;
    transition: color 0.2s;
  }
  .nav-links a:hover { color: var(--white); }
  .nav-links a.active { color: var(--teal); }
  .nav-cta { display: flex; gap: 12px; align-items: center; }
  .nav-menu { display: contents; }
  .nav-toggle {
    display: none;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    width: 44px; height: 44px;
    padding: 10px;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .nav-toggle span {
    display: block;
    width: 100%; height: 2px;
    background: var(--white);
    border-radius: 2px;
    transition: transform 0.2s, opacity 0.2s;
  }
  nav.open .nav-toggle span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  nav.open .nav-toggle span:nth-child(2) { opacity: 0; }
  nav.open .nav-toggle span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 20px;
    min-height: 44px;
    border-radius: 8px;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 0.95rem;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }
  .btn-primary { background: #00ffb3; font-weight: 700; color: #020c28; }
  .btn-primary:hover { background: #3de8b4; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--white); border-color: rgba(255,255,255,0.2); }

  /* ── PAGE HEADER ─────────────────────────────────────────────────── */
  .cl-hero {
    position: relative;
    padding: 140px 48px 48px;
    max-width: 900px;
    margin: 0 auto;
    overflow: hidden;
  }
  .cl-hero-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 700px 400px at 30% 0%, rgba(45,212,160,0.08) 0%, transparent 70%);
    pointer-events: none;
  }
  .section-label {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #00ffb3;
    background: rgba(0,255,179,0.1);
    border: 1px solid rgba(0,255,179,0.3);
    border-radius: 999px;
    padding: 5px 14px;
    margin-bottom: 20px;
    font-weight: 600;
    position: relative;
  }
  .cl-hero h1 {
    font-family: var(--font-display);
    font-size: clamp(2.4rem, 5vw, 3.6rem);
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.03em;
    color: var(--white);
    margin-bottom: 16px;
    position: relative;
  }
  .cl-hero p {
    font-size: 1.1rem;
    color: var(--muted);
    max-width: 640px;
    line-height: 1.7;
    position: relative;
  }
  .cl-hero-links {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 28px;
    position: relative;
  }

  /* ── RELEASE LIST ────────────────────────────────────────────────── */
  .cl-main { max-width: 900px; margin: 0 auto; padding: 24px 48px 100px; }
  .cl-release {
    border-top: 1px solid var(--border);
    padding: 40px 0;
    scroll-margin-top: 84px;
  }
  .cl-release:first-child { border-top: none; padding-top: 8px; }
  .cl-release-head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }
  .cl-version {
    font-family: var(--font-display);
    font-size: 1.9rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .cl-version a { color: var(--white); text-decoration: none; }
  .cl-version a:hover { color: var(--teal); }
  .cl-date {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
    opacity: 0.75;
  }
  .cl-release-bump {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    border-radius: 999px;
    padding: 3px 10px;
  }
  .cl-release-bump.minor, .cl-bump.minor {
    color: var(--purple);
    background: var(--purple-subtle);
    border: 1px solid rgba(167,139,255,0.3);
  }
  .cl-release-bump.patch, .cl-bump.patch {
    color: var(--teal);
    background: var(--teal-subtle);
    border: 1px solid rgba(45,212,160,0.25);
  }
  .cl-release-bump.major, .cl-bump.major {
    color: var(--amber);
    background: var(--amber-subtle);
    border: 1px solid rgba(245,158,66,0.3);
  }
  .cl-npm-link {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--muted);
    text-decoration: none;
    opacity: 0.7;
    margin-left: auto;
    transition: opacity 0.2s, color 0.2s;
  }
  .cl-npm-link:hover { opacity: 1; color: var(--teal); }

  .cl-entries { list-style: none; display: flex; flex-direction: column; gap: 16px; }
  .cl-entry {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px 24px;
    transition: background 0.2s, border-color 0.2s;
  }
  .cl-entry:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.16); }
  .cl-entry-head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .cl-bump {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    border-radius: 999px;
    padding: 2px 9px;
  }
  .cl-entry-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  .cl-entry-meta a { color: var(--muted); text-decoration: none; opacity: 0.72; transition: opacity 0.2s, color 0.2s; }
  .cl-entry-meta a:hover { opacity: 1; color: var(--teal); }
  .cl-sep { color: var(--muted); opacity: 0.35; }

  .cl-entry-body > p:first-child { color: #edf2ff; }
  .cl-entry-body p { font-size: 0.98rem; line-height: 1.7; }
  .cl-entry-body p + p { margin-top: 12px; }
  .cl-entry-body a { color: var(--teal); text-decoration: none; }
  .cl-entry-body a:hover { text-decoration: underline; }
  .cl-entry-body code {
    font-family: var(--font-mono);
    font-size: 0.85em;
    color: var(--teal);
    background: rgba(0,255,179,0.08);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .cl-entry-body strong { color: var(--white); font-weight: 600; }
  .cl-sublist { list-style: none; margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .cl-sublist li {
    position: relative;
    padding-left: 18px;
    font-size: 0.95rem;
    color: var(--muted);
  }
  .cl-sublist li::before {
    content: '';
    position: absolute;
    left: 2px; top: 0.72em;
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--teal);
    opacity: 0.6;
  }

  .cl-code {
    margin-top: 14px;
    padding: 14px 16px;
    background: rgba(2,12,40,0.6);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .cl-code code {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--muted);
    background: none;
    padding: 0;
    white-space: pre;
  }

  .cl-detail { margin-top: 14px; }
  .cl-detail summary {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--teal);
    cursor: pointer;
    display: inline-block;
    padding: 4px 0;
    list-style: none;
  }
  .cl-detail summary::-webkit-details-marker { display: none; }
  .cl-detail summary::after { content: ' ↓'; }
  .cl-detail[open] summary::after { content: ' ↑'; }
  .cl-detail summary:hover { text-decoration: underline; }
  .cl-detail-body {
    margin-top: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    color: var(--muted);
  }

  /* ── EARLY RELEASES ──────────────────────────────────────────────── */
  .cl-early {
    border-top: 1px solid var(--border);
    padding-top: 40px;
    margin-top: 8px;
  }
  .cl-early h2 {
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--white);
    margin-bottom: 8px;
  }
  .cl-early p { font-size: 0.95rem; color: var(--muted); margin-bottom: 20px; max-width: 620px; }
  .cl-early-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    list-style: none;
  }
  .cl-early-grid a {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--muted);
    text-decoration: none;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 12px;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .cl-early-grid a:hover { background: var(--card-hover); border-color: rgba(45,212,160,0.3); color: var(--white); }
  .cl-early-grid .v { color: var(--teal); }
  .cl-early-grid .d { opacity: 0.6; }

  /* ── FOOTER ──────────────────────────────────────────────────────── */
  footer {
    border-top: 1px solid var(--border);
    padding: 40px 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .footer-logo {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1rem;
    color: var(--white);
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }
  .footer-meta { font-size: 0.875rem; color: var(--muted); }
  .footer-links { display: flex; gap: 24px; }
  .footer-links a {
    font-size: 0.875rem;
    color: var(--muted);
    text-decoration: none;
    transition: color 0.2s;
  }
  .footer-links a:hover { color: var(--white); }

  /* ── RESPONSIVE ──────────────────────────────────────────────────── */
  @media (max-width: 1199px) {
    .nav-toggle { display: flex; }
    .nav-menu {
      display: none;
      position: absolute;
      top: 64px; left: 0; right: 0;
      flex-direction: column;
      align-items: stretch;
      gap: 20px;
      padding: 20px 24px 28px;
      background: rgba(13,27,62,0.98);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }
    nav.open .nav-menu { display: flex; }
    .nav-menu .nav-links { flex-direction: column; gap: 20px; }
    .nav-menu .nav-cta { flex-direction: column; align-items: stretch; gap: 12px; }
    .nav-menu .nav-cta .btn { justify-content: center; }
  }

  @media (max-width: 900px) {
    nav { padding: 0 24px; }
    .cl-hero { padding: 110px 24px 32px; }
    .cl-main { padding: 16px 24px 64px; }
    footer { flex-direction: column; gap: 24px; text-align: center; }
  }

  @media (max-width: 480px) {
    nav { padding: 0 16px; }
    .cl-hero { padding: 96px 16px 24px; }
    .cl-main { padding: 12px 16px 48px; }
    .cl-entry { padding: 18px 16px; }
    .cl-npm-link { margin-left: 0; }
    footer { padding: 24px 16px; }
  }

  /* ── SKIP LINK ──────────────────────────────────────────────────── */
  .skip-link {
    position: absolute;
    top: -100%;
    left: 16px;
    z-index: 200;
    padding: 8px 16px;
    background: var(--teal);
    color: var(--navy);
    font-weight: 700;
    font-size: 0.875rem;
    border-radius: 0 0 8px 8px;
    text-decoration: none;
    transition: top 0.2s;
  }
  .skip-link:focus { top: 0; }

  /* ── FOCUS STYLES ───────────────────────────────────────────────── */
  :focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

  /* ── REDUCED MOTION ─────────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
</head>
<body>

<a href="#main-content" class="skip-link">Skip to content</a>

<!-- NAV -->
<nav role="navigation" aria-label="Main navigation">
  <a href="/" class="nav-logo" aria-label="Home">
    <div class="nav-logo-mark">
      <img src="/n-dx-logo.png" alt="" width="32" height="32">
    </div>
    <span class="nav-logo-text">n-dx</span>
  </a>
  <button class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="nav-menu">
    <span></span><span></span><span></span>
  </button>
  <div class="nav-menu" id="nav-menu">
    <ul class="nav-links" role="list">
      <li><a href="/#packages">Packages</a></li>
      <li><a href="/#how">Workflow</a></li>
      <li><a href="/#usecases">Use Cases</a></li>
      <li><a href="/mwfb2026/">Challenge</a></li>
      <li><a href="/changelog/" class="active" aria-current="page">Changelog</a></li>
      <li><a href="/#compare">Compare</a></li>
    </ul>
    <div class="nav-cta">
      <a href="https://docs.n-dx.dev" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">Docs</a>
      <a href="${REPO}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">GitHub ↗</a>
      <a href="/#install" class="btn btn-primary">Get Started</a>
    </div>
  </div>
</nav>

<div class="cl-hero">
  <div class="cl-hero-bg"></div>
  <div class="section-label">Changelog</div>
  <h1>Every release,<br>in its own words.</h1>
  <p>
    Release notes for <code style="font-family:var(--font-mono);font-size:0.95rem;color:var(--teal)">${PKG}</code> —
    generated from the changesets that shipped each version. Currently on
    <strong style="color:var(--white)">v${esc(latest)}</strong>, released ${esc(formatDate(releases[0].published))}.
  </p>
  <div class="cl-hero-links">
    <a href="${NPM_PAGE}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">View on npm ↗</a>
    <a href="${REPO}/releases" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">GitHub releases ↗</a>
    <a href="/#install" class="btn btn-primary">Get Started</a>
  </div>
</div>

<main id="main-content" class="cl-main">
${releases.map(renderRelease).join('\n')}
${
  early.length
    ? `
      <section class="cl-early" aria-labelledby="early-heading">
        <h2 id="early-heading">Other releases</h2>
        <p>
          Versions with no user-facing notes &mdash; dependency-only bumps, and
          releases published before the project adopted changesets. Details live in
          the commit history.
        </p>
        <ul class="cl-early-grid" role="list">
${early
  .map(
    (r) =>
      `          <li><a href="${NPM_PAGE}/v/${esc(r.version)}" target="_blank" rel="noopener noreferrer"><span class="v">${esc(r.version)}</span><span class="d">${esc(formatDate(r.published))}</span></a></li>`
  )
  .join('\n')}
        </ul>
      </section>`
    : ''
}
</main>

<!-- FOOTER -->
<footer role="contentinfo">
  <a href="/" class="footer-logo">
    <span style="font-family:var(--font-display);font-size:1.1rem;font-weight:800;color:var(--white);">n-dx</span>
  </a>
  <div class="footer-meta">Open source · Elastic License 2.0</div>
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="font-size:0.75rem;color:var(--muted);font-family:var(--font-body);">Built by</span>
    <a href="https://endash.us" target="_blank" rel="noopener noreferrer" aria-label="En Dash Consulting" style="display:inline-flex;">
      <img src="/assets/logo-endash.webp" alt="En Dash Consulting" width="125" height="125" loading="lazy" decoding="async" style="height:40px;width:auto;border-radius:6px;">
    </a>
  </div>
  <div class="footer-links">
    <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>
    <a href="https://docs.n-dx.dev" target="_blank" rel="noopener noreferrer">Docs</a>
    <a href="/mwfb2026/">Challenge</a>
    <a href="https://endash.us" target="_blank" rel="noopener noreferrer">En Dash</a>
  </div>
</footer>

<script>
  (function () {
    var nav = document.querySelector('nav');
    var btn = nav && nav.querySelector('.nav-toggle');
    if (!btn) return;
    function close() {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    nav.querySelectorAll('.nav-menu a').forEach(function (a) {
      a.addEventListener('click', close);
    });
  })();
</script>
</body>
</html>
`
}

// ── index.html regions ─────────────────────────────────────────────────────

function buildHeroPill(release) {
  return `      <a class="hero-version-pill" href="changelog/">
        <span class="hero-version-num">v${esc(release.version)}</span>
        <span class="hero-version-sep">·</span>
        <span>What&rsquo;s new</span>
        <span class="hero-version-arrow" aria-hidden="true">&rarr;</span>
      </a>`
}

function buildLatestSection(releases) {
  const cards = releases
    .slice(0, FRONT_PAGE_COUNT)
    .map((release) => {
      const bullets = release.entries
        .slice(0, FRONT_PAGE_BULLETS)
        .map((e) => `<li>${esc(truncate(plain(e.summary), 120))}</li>`)
        .join('\n            ')
      const more = release.entries.length - FRONT_PAGE_BULLETS
      return `        <a class="release-card" href="changelog/#${anchor(release.version)}">
          <div class="release-card-head">
            <span class="release-version">${esc(release.version)}</span>
            <span class="release-bump ${releaseBump(release).toLowerCase()}">${releaseBump(release)}</span>
          </div>
          <time class="release-date" datetime="${esc(release.published)}">${esc(formatDate(release.published))}</time>
          <ul class="release-bullets" role="list">
            ${bullets}
          </ul>
          ${more > 0 ? `<span class="release-more">+${more} more change${more === 1 ? '' : 's'}</span>` : ''}
        </a>`
    })
    .join('\n')

  return `<!-- CHANGELOG -->
<section id="changelog" class="changelog-section" aria-labelledby="changelog-heading">
  <div class="changelog-header">
    <div>
      <div class="section-label purple">Changelog</div>
      <h2 class="section-title" id="changelog-heading">Shipping in the open.</h2>
      <p class="section-body">
        Every version of <code style="font-family:var(--font-mono);font-size:0.95rem;color:var(--teal)">${PKG}</code>
        ships with notes written by the person who built the change &mdash; not a
        dependency-bump digest.
      </p>
    </div>
    <a href="changelog/" class="btn btn-ghost">Full changelog &rarr;</a>
  </div>
  <div class="release-grid">
${cards}
  </div>
</section>`
}

// Whatever the file already uses. On a Windows checkout with core.autocrlf=true
// index.html is CRLF, and splicing LF-only regions into it would leave the file
// internally mixed.
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n')

const toEol = (text, eol) => text.replace(/\r\n|\n/g, eol)

// Rewrite the content between a pair of marker comments, leaving the markers in
// place so the next run can find the region again.
function replaceRegion(html, name, content) {
  const start = `<!-- SYNC:${name}:START -->`
  const end = `<!-- SYNC:${name}:END -->`
  const from = html.indexOf(start)
  const to = html.indexOf(end)
  if (from === -1 || to === -1) {
    throw new Error(
      `index.html is missing the ${start} / ${end} markers — cannot place the ${name} region.`
    )
  }
  const eol = eolOf(html)
  return (
    html.slice(0, from + start.length) +
    eol +
    toEol(content, eol) +
    eol +
    html.slice(to)
  )
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const [registry, markdown] = await Promise.all([
    get(REGISTRY, 'json'),
    get(CHANGELOG, 'text'),
  ])

  const latest = registry['dist-tags']?.latest
  const published = registry.time || {}
  if (!latest) throw new Error('registry response has no dist-tags.latest')

  const parsed = parseChangelog(markdown)

  // Every version npm actually served, oldest first — the spine we measure bumps
  // against, so an unpublished version in the CHANGELOG can't shift a badge.
  const shipped = Object.keys(published)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => new Date(published[a]) - new Date(published[b]))

  // A version is only news if npm served it and it carried a user-facing change:
  // the CHANGELOG holds versions that were tagged but never published (0.4.2),
  // and versions whose only entries were dependency bumps (0.2.1).
  const releases = parsed
    .filter((r) => published[r.version] && r.entries.length)
    .map((r) => ({
      ...r,
      published: published[r.version],
      previous: shipped[shipped.indexOf(r.version) - 1] || null,
    }))

  if (!releases.length) throw new Error('no releases survived the npm/CHANGELOG intersection')
  if (releases[0].version !== latest) {
    console.warn(
      `warning: newest documented release is ${releases[0].version} but npm latest is ${latest} — CHANGELOG.md may lag the publish.`
    )
  }

  const documented = new Set(releases.map((r) => r.version))
  const early = Object.keys(published)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && !documented.has(v))
    .map((v) => ({ version: v, published: published[v] }))
    .sort((a, b) => new Date(b.published) - new Date(a.published))

  // Landing-page regions. Read first, so the generated page can adopt the same
  // line endings as the checkout it is being written into.
  const indexPath = join(ROOT, 'index.html')
  let index = await readFile(indexPath, 'utf8')
  const eol = eolOf(index)

  index = replaceRegion(index, 'HERO_VERSION', buildHeroPill(releases[0]))
  index = replaceRegion(index, 'LATEST_RELEASES', buildLatestSection(releases))
  await writeFile(indexPath, index, 'utf8')

  // Full changelog page.
  await mkdir(join(ROOT, 'changelog'), { recursive: true })
  await writeFile(
    join(ROOT, 'changelog', 'index.html'),
    toEol(buildChangelogPage(releases, early, latest), eol),
    'utf8'
  )

  console.log(
    `synced ${releases.length} documented release${releases.length === 1 ? '' : 's'} ` +
      `(latest ${latest}, ${releases.reduce((n, r) => n + r.entries.length, 0)} entries) ` +
      `+ ${early.length} earlier version${early.length === 1 ? '' : 's'}`
  )
}

main().catch((err) => {
  console.error(`sync-changelog failed: ${err.message}`)
  process.exit(1)
})
