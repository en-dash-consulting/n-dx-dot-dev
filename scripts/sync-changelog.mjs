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

  // The Thanks clause is matched only so it can be stripped — the page credits
  // the PR, not the author.
  const m = dedented.match(WITH_THANKS) || dedented.match(WITHOUT_THANKS)
  if (m) {
    body = dedented.slice(m[0].length).trim()
    pr = m[1] || null
    prUrl = m[2] || null
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

// Collapse a block's soft line wraps (and any bullet markers) into one line, for
// use inside a list item where a nested <p> or <ul> would fight the layout.
const flatten = (md) =>
  md
    .split('\n')
    .map((l) => l.trim().replace(/^[-*]\s+/, ''))
    .filter(Boolean)
    .join(' ')

// One release renders as a single item: every change in it becomes a bullet, and
// the full prose for all of them sits behind one disclosure rather than a stack
// of per-change cards.
function renderRelease(release) {
  const bullets = release.entries
    .map((entry) => {
      const pr =
        entry.pr && entry.prUrl
          ? ` <a class="cl-pr" href="${esc(entry.prUrl)}" target="_blank" rel="noopener noreferrer">#${esc(entry.pr)}</a>`
          : ''
      return `            <li>${inline(flatten(entry.summary))}${pr}</li>`
    })
    .join('\n')

  const notes = release.entries
    .filter((entry) => entry.detail.length)
    .map(
      (entry) =>
        `<div class="cl-note"><p class="cl-note-lead">${inline(flatten(entry.summary))}</p>${entry.detail
          .map(renderBlock)
          .join('')}</div>`
    )
    .join('')

  const detail = notes
    ? `<details class="cl-detail"><summary>Full release notes</summary><div class="cl-detail-body">${notes}</div></details>`
    : ''

  return `<article class="cl-release" id="${anchor(release.version)}">
        <header class="cl-release-head">
          <h2 class="cl-version">
            <a href="#${anchor(release.version)}" aria-label="Permalink to ${esc(release.version)}">${esc(release.version)}</a>
          </h2>
          <time class="cl-date" datetime="${esc(release.published)}">${esc(formatDate(release.published))}</time>
          <span class="cl-release-bump ${releaseBump(release).toLowerCase()}">${releaseBump(release)}</span>
          <a class="cl-npm-link" href="${NPM_PAGE}/v/${esc(release.version)}" target="_blank" rel="noopener noreferrer">npm ↗</a>
        </header>
        <div class="cl-release-body">
          <ul class="cl-changes" role="list">
${bullets}
          </ul>
          ${detail}
        </div>
      </article>`
}

function buildChangelogPage(releases, early, latest) {
  const headline = truncate(plain(releases[0].entries[0].summary), 150)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script>
  // Apply a saved theme before first paint, so there is no flash of the other
  // one. With nothing saved, CSS follows prefers-color-scheme.
  try { var t = localStorage.getItem('ndx-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
</script>
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
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e0d13" media="(prefers-color-scheme: dark)">

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
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Silkscreen&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="/n-dx-logo.png">
<link rel="apple-touch-icon" href="/n-dx-logo.png">
<link rel="stylesheet" href="/assets/css/site.css">
<script>document.documentElement.classList.add('js')</script>
<style>
  /* Changelog page. Tokens, nav, footer and badges come from /assets/css/site.css. */
  .cl-hero { padding: calc(var(--nav-h) + 56px) 0 40px; }
  .cl-hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: end; margin-top: 28px; }
  .cl-hero h1 { font-size: clamp(3rem, 8vw, 7.4rem); }
  .cl-hero p { margin: 24px 0 0; }
  .cl-hero code { font-family: var(--f-mono); font-size: 0.9em; color: var(--purple-2); }
  .cl-hero-links { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 28px; }
  .cl-hero-art { width: 184px; height: 152px; }
  .cl-main { padding-bottom: 120px; }
  .cl-release { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 32px; padding: 40px 0; border-top: 1px solid var(--ink); scroll-margin-top: 80px; }
  .cl-release-head { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; position: sticky; top: calc(var(--nav-h) + 20px); align-self: start; }
  .cl-version { font-family: var(--f-display); font-size: clamp(2.4rem, 4vw, 3.6rem); font-weight: 600; letter-spacing: -0.045em; line-height: 0.9; }
  .cl-version a { text-decoration: none; }
  .cl-version a:hover { color: var(--purple); }
  .cl-date { font-family: var(--f-mono); font-size: 12px; text-transform: uppercase; color: var(--mute); }
  .cl-npm-link { font-family: var(--f-mono); font-size: 12px; text-transform: uppercase; text-decoration: none; color: var(--purple); }
  .cl-npm-link:hover { text-decoration: underline; }
  .cl-changes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  .cl-changes > li { position: relative; padding-left: 22px; line-height: 1.6; }
  .cl-changes > li::before { content: ''; position: absolute; left: 0; top: 0.55em; width: 8px; height: 8px; background: var(--purple); box-shadow: inset -2px -2px 0 var(--purple-2); }
  .cl-pr { font-family: var(--f-mono); font-size: 12px; color: var(--mute); text-decoration: none; white-space: nowrap; }
  .cl-pr:hover { color: var(--purple); }
  .cl-release-body code { font-family: var(--f-mono); font-size: 0.86em; background: var(--tint); color: var(--purple-2); padding: 0.05em 0.35em; }
  .cl-release-body a:not(.cl-pr) { color: var(--purple-2); }
  .cl-release-body strong { font-weight: 600; }
  .cl-release-body p { margin: 0; }
  .cl-release-body p + p { margin-top: 12px; }
  .cl-note + .cl-note { margin-top: 22px; padding-top: 22px; border-top: 1px dashed var(--line-2); }
  .cl-note-lead { font-weight: 600; }
  .cl-sublist { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; color: var(--ink-2); }
  .cl-sublist li { position: relative; padding-left: 18px; font-size: 15.5px; }
  .cl-sublist li::before { content: ''; position: absolute; left: 0; top: 0.6em; width: 6px; height: 6px; background: var(--teal-ink); }
  .cl-code { margin: 14px 0 0; padding: 14px 16px; background: var(--crt); color: var(--crt-text); overflow-x: auto; font-size: 12.5px; line-height: 1.6; }
  .cl-code code { background: none !important; color: inherit !important; padding: 0 !important; white-space: pre; }
  .cl-detail { margin-top: 18px; }
  .cl-detail summary { display: inline-flex; gap: 8px; align-items: center; cursor: pointer; list-style: none; font-family: var(--f-mono); font-size: 12px; text-transform: uppercase; padding: 6px 10px; border: 1px solid var(--ink); }
  .cl-detail summary::-webkit-details-marker { display: none; }
  .cl-detail summary::after { content: '+'; }
  .cl-detail[open] summary::after { content: '−'; }
  .cl-detail summary:hover { background: var(--ink); color: var(--paper); }
  .cl-detail-body { margin-top: 18px; padding: 20px; background: var(--paper-2); border-left: 3px solid var(--purple); color: var(--ink-2); }
  .cl-early { border-top: 1px solid var(--ink); padding-top: 40px; }
  .cl-early h2 { font-family: var(--f-display); text-transform: uppercase; letter-spacing: -0.03em; font-size: 2rem; }
  .cl-early p { color: var(--ink-2); max-width: 40em; margin: 10px 0 20px; }
  .cl-early-grid { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .cl-early-grid a { display: inline-flex; gap: 8px; font-family: var(--f-mono); font-size: 12px; text-decoration: none; border: 1px solid var(--line-2); padding: 6px 10px; }
  .cl-early-grid a:hover { border-color: var(--ink); background: var(--paper-2); }
  .cl-early-grid .v { color: var(--purple); }
  .cl-early-grid .d { color: var(--mute); }
  @media (max-width: 800px) {
    .cl-hero-grid { grid-template-columns: 1fr; }
    .cl-hero-art { display: none; }
    .cl-release { grid-template-columns: 1fr; gap: 18px; }
    .cl-release-head { position: static; flex-direction: row; flex-wrap: wrap; align-items: center; }
  }
</style>
</head>
<body>

<a href="#main-content" class="skip-link">Skip to content</a>

<nav class="nav" aria-label="Main">
  <a href="/" class="logo" aria-label="n-dx home">
    <img src="/n-dx-logo.png" alt="" width="30" height="30">
    <span class="logo-word">n-dx</span>
  </a>
  <button class="nav-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav-menu"><span></span><span></span><span></span></button>
  <div class="nav-menu" id="nav-menu">
    <ul class="nav-links">
      <li><a href="/#loop">The loop</a></li>
      <li><a href="/#tools">Tools</a></li>
      <li><a href="/#features">Features</a></li>
      <li><a href="/#compare">Compare</a></li>
      <li><a href="/changelog/" aria-current="page">Changelog</a></li>
      <li><a href="https://docs.n-dx.dev" target="_blank" rel="noopener noreferrer">Docs</a></li>
    </ul>
    <div class="nav-cta">
      <a class="btn btn-ghost btn-sm" href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      <a class="btn btn-sm" href="/#install">Get started <span class="arr">→</span></a>
    </div>
  </div>
  <button class="theme-toggle" type="button" aria-label="Switch theme">
    <canvas class="i-moon" data-sprite="moon" data-scale="2" aria-hidden="true"></canvas>
    <canvas class="i-sun" data-sprite="sun" data-scale="2" aria-hidden="true"></canvas>
  </button>
</nav>

<header class="cl-hero">
  <div class="wrap">
    <div class="bar"><span class="idx">CL</span><span>Changelog</span><span class="ticks"></span><span>v${esc(latest)}</span></div>
    <div class="cl-hero-grid">
      <div>
        <h1 class="display" data-reveal>Every release,<br>in its own words.</h1>
        <p class="lede">
          Release notes for <code>${PKG}</code>, generated from the changesets that shipped each
          version. Currently on <strong>v${esc(latest)}</strong>, released ${esc(formatDate(releases[0].published))}.
        </p>
        <div class="cl-hero-links">
          <a href="${NPM_PAGE}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">View on npm ↗</a>
          <a href="${REPO}/releases" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">GitHub releases ↗</a>
          <a href="/#install" class="btn">Get started <span class="arr">→</span></a>
        </div>
      </div>
      <canvas class="cl-hero-art" data-sprite="rex_idle0" data-frames="rex_idle0,rex_idle0,rex_idle0,rex_idle1" data-fps="3" data-scale="8" aria-hidden="true"></canvas>
    </div>
  </div>
</header>
<main id="main-content" class="cl-main wrap">
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

<footer class="foot" role="contentinfo">
  <div class="wrap">
    <div class="foot-top">
      <div>
        <a href="/" class="logo" aria-label="n-dx home"><img src="/n-dx-logo.png" alt="" width="30" height="30"><span class="logo-word">n-dx</span></a>
        <p class="foot-blurb" style="margin-top:16px">Map it. Plan it. Ship it. A CLI toolkit that closes the loop between understanding a codebase and shipping work against a plan.</p>
      </div>
      <div><h4>Product</h4><ul><li><a href="/#loop">The loop</a></li><li><a href="/#tools">Tools</a></li><li><a href="/#features">Features</a></li><li><a href="/changelog/">Changelog</a></li></ul></div>
      <div><h4>Compare</h4><ul><li><a href="/#compare">vs coding agents</a></li><li><a href="/vs/spec-kit/">vs Spec Kit, OpenSpec, Kiro</a></li></ul></div>
      <div><h4>Resources</h4><ul><li><a href="https://docs.n-dx.dev" target="_blank" rel="noopener noreferrer">Docs</a></li><li><a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a></li><li><a href="${NPM_PAGE}" target="_blank" rel="noopener noreferrer">npm</a></li><li><a href="https://endash.us" target="_blank" rel="noopener noreferrer">En Dash</a></li></ul></div>
    </div>
    <div class="foot-word" aria-hidden="true"><canvas></canvas></div>
    <div class="foot-bottom">
      <span>© 2026 En Dash Consulting · Elastic License 2.0</span>
      <a class="foot-endash" href="https://endash.us" target="_blank" rel="noopener noreferrer"><span>Built by</span><img src="/assets/logo-endash.webp" alt="En Dash Consulting" width="125" height="125" loading="lazy" decoding="async"></a>
    </div>
  </div>
</footer>

<script src="/assets/js/sprites.js"></script>
<script src="/assets/js/pixel.js"></script>
<script src="/assets/js/site.js"></script>
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
  <div class="wrap">
    <div class="bar"><span class="idx">08</span><span>Changelog</span><span class="ticks"></span></div>
    <div class="changelog-header">
      <div>
        <h2 class="section-title" id="changelog-heading" data-reveal>Shipping<br>in the open.</h2>
        <p class="section-body">
          Release notes for <code class="path">${PKG}</code>, pulled from the core repo&rsquo;s
          CHANGELOG and matched to what actually shipped on npm.
        </p>
      </div>
      <a href="changelog/" class="btn btn-ghost">Full changelog <span class="arr">&rarr;</span></a>
    </div>
    <div class="release-grid">
${cards}
    </div>
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
