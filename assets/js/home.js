// Landing page motion: the hero scan map (real n-dx data), the pinned four-level
// loop, bento tile animations, use-case scenes, and the ship-it mini game.
;(function () {
  var P = window.NDXPixel
  var MAP = window.NDX_MAP
  if (!P) return
  var REX = P.size('rex_idle0')
  var reduce = P.reduce
  var DPR = Math.min(2, window.devicePixelRatio || 1)
  var PAL = P.PALETTE

  // ── helpers ───────────────────────────────────────────────────────
  // Current theme colours (site.js reads them from the CSS tokens).
  var FALLBACK = { dark: false, ink: '#16151c', ink2: '#34333b', mute: '#66656d', paper: '#fafafa', purple: '#6a3df0', night: '#16151c', onNight: '#f4f3f8' }
  function TH() { return window.ndxTheme ? window.ndxTheme() : FALLBACK }
  function A(hex, a) { return window.ndxAlpha ? window.ndxAlpha(hex, a) : hex }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
  function fit(canvas, dpr) {
    dpr = dpr || DPR
    var r = canvas.getBoundingClientRect()
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    var ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    return { ctx: ctx, w: w, h: h, cw: r.width, ch: r.height, dpr: dpr }
  }
  // Run fn(t, dt) every frame only while el is on screen.
  var loops = []
  function animate(el, fn) {
    var st = { el: el, fn: fn, on: false, last: 0 }
    loops.push(st)
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { st.on = e[0].isIntersecting }, { rootMargin: '100px' }).observe(el)
    else st.on = true
    if (reduce) {
      requestAnimationFrame(function (t) { fn(t, 0, true) })
      document.addEventListener('ndx:theme', function () { fn(performance.now(), 0, true) })
    }
    return st
  }
  if (!reduce) requestAnimationFrame(function frame(t) {
    for (var i = 0; i < loops.length; i++) {
      var s = loops[i]
      if (!s.on) { s.last = 0; continue }
      var dt = s.last ? Math.min(0.05, (t - s.last) / 1000) : 0.016
      s.last = t
      s.fn(t, dt)
    }
    requestAnimationFrame(frame)
  })
  var onResize = []
  var rzt
  window.addEventListener('resize', function () { clearTimeout(rzt); rzt = setTimeout(function () { onResize.forEach(function (f) { f() }) }, 150) })

  // Package colours, each with shades so neighbouring zones of one package
  // stay distinguishable.
  var GROUPS = {
    rex: ['#6a3df0', '#8a63ff', '#4522b8', '#a48bff'],
    hench: ['#00c49a', '#00e0b0', '#008f70', '#5ce8c8'],
    sourcevision: ['#ffb020', '#ffc95c'],
    web: ['#3d7bff', '#6f9bff', '#2152c9', '#9dbbff', '#1a3f9e', '#5a8cff'],
    llm: ['#e85fb0'],
    core: ['#ff4d1f', '#ff7a52', '#c93a12'],
    tests: ['#aeacb5', '#8e8c96', '#c4c2ca', '#77757e', '#9d9ba4', '#b8b6bf'],
  }
  function groupOf(id) {
    if (/^tests/.test(id)) return 'tests'
    if (/^rex/.test(id)) return 'rex'
    if (/^hench/.test(id)) return 'hench'
    if (/^sourcevision/.test(id)) return 'sourcevision'
    if (/^(web|viewer)/.test(id)) return 'web'
    if (/^llm/.test(id)) return 'llm'
    return 'core'
  }
  function colorize(zones) {
    var used = {}
    zones.forEach(function (z) {
      var g = groupOf(z.id)
      used[g] = (used[g] || 0)
      z.color = GROUPS[g][used[g]++ % GROUPS[g].length]
      z.group = g
    })
  }

  // Grow zones as organic blobs on a tile grid. Largest zones seed first at
  // spread-out points; every zone then claims frontier cells round-robin, and
  // a cell may not touch another zone, which leaves a one-tile border between
  // regions like a hand-drawn district map.
  function layoutZones(zones, cols, rows, seed, fill) {
    var rand = rng(seed)
    var total = zones.reduce(function (a, z) { return a + z.n }, 0)
    var cap = cols * rows * (fill || 0.62)
    var per = Math.max(1, Math.ceil(total / cap))
    var owner = new Int16Array(cols * rows).fill(-1)
    var seeds = []
    zones.forEach(function (z, zi) {
      z.target = Math.max(1, Math.round(z.n / per))
      z.tiles = []
      var best = null, bestD = -1
      for (var k = 0; k < 60; k++) {
        var x = 2 + Math.floor(rand() * (cols - 4)), y = 2 + Math.floor(rand() * (rows - 4))
        if (owner[y * cols + x] !== -1) continue
        var d = Infinity
        seeds.forEach(function (s) { d = Math.min(d, (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) / (s.w)) })
        // Big zones prefer the middle; small ones are happy at the edges.
        var cx = (x - cols / 2) / cols, cy = (y - rows / 2) / rows
        d -= (cx * cx + cy * cy) * z.target * 0.6
        if (d > bestD) { bestD = d; best = { x: x, y: y } }
      }
      if (!best) best = { x: Math.floor(rand() * cols), y: Math.floor(rand() * rows) }
      seeds.push({ x: best.x, y: best.y, w: Math.max(1, Math.sqrt(z.target) / 6) })
      z.frontier = [best.y * cols + best.x]
    })
    var N = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    var ok = function (i, zi) {
      if (owner[i] !== -1) return false
      var x = i % cols, y = (i / cols) | 0
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        var o = owner[ny * cols + nx]
        if (o !== -1 && o !== zi) return false
      }
      return true
    }
    var active = true, guard = 0
    while (active && guard++ < 5000) {
      active = false
      zones.forEach(function (z, zi) {
        if (z.tiles.length >= z.target) return
        var steps = Math.max(1, Math.ceil(z.target / 40))
        for (var s = 0; s < steps && z.tiles.length < z.target && z.frontier.length; s++) {
          var j = Math.floor(rand() * Math.min(z.frontier.length, 6 + z.frontier.length * 0.4))
          var i = z.frontier.splice(j, 1)[0]
          if (!ok(i, zi)) continue
          owner[i] = zi
          z.tiles.push(i)
          var x = i % cols, y = (i / cols) | 0
          N.forEach(function (d) {
            var nx = x + d[0], ny = y + d[1]
            if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) z.frontier.push(ny * cols + nx)
          })
        }
        if (z.tiles.length < z.target && z.frontier.length) active = true
      })
    }
    zones.forEach(function (z) {
      var sx = 0, sy = 0
      z.tiles.forEach(function (i) { sx += i % cols; sy += (i / cols) | 0 })
      var n = z.tiles.length || 1
      z.cx = sx / n; z.cy = sy / n
      // Anchor tile: the member nearest the centroid, so pins sit inside.
      var best = z.tiles[0], bd = Infinity
      z.tiles.forEach(function (i) { var d = Math.pow(i % cols - z.cx, 2) + Math.pow(((i / cols) | 0) - z.cy, 2); if (d < bd) { bd = d; best = i } })
      z.anchor = best
      delete z.frontier
    })
    return { owner: owner, per: per }
  }

  // ═════════════ HERO SCAN MAP ═════════════
  var scanEl = document.querySelector('.scan')
  if (scanEl && MAP) (function () {
    var canvas = scanEl.querySelector('.scan-canvas')
    var stage = scanEl.querySelector('.scan-stage')
    var calloutBox = scanEl.querySelector('.scan-callouts')
    var mappedEl = scanEl.querySelector('[data-mapped]')
    var zoneEl = scanEl.querySelector('[data-zone]')
    var runBtn = scanEl.querySelector('.scan-run')
    var zones = MAP.zones.map(function (z) { return Object.assign({}, z) })
    colorize(zones)
    var byId = {}
    zones.forEach(function (z, i) { byId[z.id] = i })

    var G = {}, rev, owner, fileIx, tile, cols, rows, zoneTiles = 0
    var lens = { x: -999, y: -999, tx: 0, ty: 0, r: 7 }
    var pointer = { active: false, last: 0 }
    var full = 0 // 0 = none, 0..1 sweeping, 1 = done
    var sweeping = false
    var rex = { x: 40, y: 40, face: 1, walking: false }
    var pins = []
    var shownCallouts = {}
    var cycle = { i: 0, t: 0 }

    function build() {
      G = fit(canvas)
      tile = Math.max(5, Math.round((G.cw < 500 ? 7 : 9) * G.dpr))
      cols = Math.floor(G.w / tile)
      rows = Math.floor(G.h / tile)
      var L = layoutZones(zones, cols, rows, 7, 0.6)
      owner = L.owner
      rev = new Float32Array(cols * rows)
      fileIx = new Int32Array(cols * rows).fill(-1)
      zoneTiles = 0
      zones.forEach(function (z) {
        z.tiles.forEach(function (i, k) { fileIx[i] = k; zoneTiles++ })
      })
      if (full >= 1) rev.fill(1)
      pins = MAP.findings.map(function (f, k) {
        var z = zones[byId[f.zone]]
        if (!z || !z.tiles.length) return null
        // Spread two pins in one zone apart.
        var t = z.tiles[Math.min(z.tiles.length - 1, Math.floor(z.tiles.length * (0.15 + 0.5 * hash(k))))]
        return { f: f, z: z, i: t, x: t % cols, y: (t / cols) | 0, k: k }
      }).filter(Boolean)
      lens.r = G.cw < 500 ? 5 : 7
      if (rex.x > G.w) rex.x = G.w * 0.3
      rex.y = Math.min(rex.y, G.h - 40 * G.dpr)
      calloutBox.innerHTML = ''
      shownCallouts = {}
    }

    function tileAt(px, py) {
      var x = Math.floor(px / tile), y = Math.floor(py / tile)
      if (x < 0 || y < 0 || x >= cols || y >= rows) return -1
      return y * cols + x
    }

    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect()
      lens.tx = (e.clientX - r.left) * G.dpr
      lens.ty = (e.clientY - r.top) * G.dpr
      pointer.active = true
      pointer.last = performance.now()
      if (lens.x < -100) { lens.x = lens.tx; lens.y = lens.ty }
      var i = tileAt(lens.tx, lens.ty)
      var zi = i >= 0 ? owner[i] : -1
      if (zi >= 0) {
        var z = zones[zi]
        var f = z.files[fileIx[i] % z.files.length]
        window.ndxCursorLabel = 'ZONE ' + z.id + ' · ' + f
        zoneEl.innerHTML = '<b>' + z.id + '</b> — ' + z.n + ' files · cohesion ' + z.cohesion + ' · coupling ' + z.coupling
      } else {
        window.ndxCursorLabel = ''
      }
    })
    canvas.addEventListener('pointerleave', function () { pointer.active = false; window.ndxCursorLabel = '' })
    canvas.addEventListener('pointerdown', function (e) {
      var r = canvas.getBoundingClientRect()
      lens.tx = (e.clientX - r.left) * G.dpr
      lens.ty = (e.clientY - r.top) * G.dpr
      pointer.last = performance.now()
    })

    function runFull() {
      if (sweeping || full >= 1) return
      sweeping = true
      full = 0
      runBtn.disabled = true
      runBtn.textContent = 'Analyzing…'
    }
    runBtn.addEventListener('click', runFull)
    // Nobody has to find the button: the full analysis runs on its own after a
    // few seconds on screen.
    var seenFor = 0

    function showCallout(p) {
      if (shownCallouts[p.k]) return shownCallouts[p.k]
      var el = document.createElement('div')
      el.className = 'callout' + (p.f.severity === 'critical' ? ' crit' : '')
      el.innerHTML = '<div class="c-k"><span>Finding · ' + p.f.type + '</span><b>' + p.f.severity + '</b></div><h4></h4><p></p><span class="c-z"></span>'
      el.querySelector('h4').textContent = p.f.title
      el.querySelector('p').textContent = p.f.text
      el.querySelector('.c-z').textContent = 'Zone ▸ ' + p.z.id
      var sx = (p.x * tile) / G.dpr, sy = (p.y * tile) / G.dpr
      var bw = stage.clientWidth - 18, bh = stage.clientHeight - 18
      var cw = bw < 500 ? 200 : 250
      var left = sx + 16 + cw > bw ? sx - cw - 12 : sx + 16
      el.style.left = Math.max(4, left) + 'px'
      el.style.top = Math.max(4, Math.min(bh - 170, sy - 20)) + 'px'
      calloutBox.appendChild(el)
      shownCallouts[p.k] = el
      return el
    }
    function hideCallout(k) {
      var el = shownCallouts[k]
      if (!el) return
      el.remove()
      delete shownCallouts[k]
    }

    function draw(t, dt, still) {
      if (!G.ctx) return
      var T = TH()
      var c = G.ctx
      var now = t / 1000

      // Autopilot lens when nobody is steering.
      var idle = !pointer.active || performance.now() - pointer.last > 2600
      if (idle) {
        lens.tx = G.w * (0.5 + 0.36 * Math.sin(now * 0.41))
        lens.ty = G.h * (0.5 + 0.34 * Math.sin(now * 0.67 + 1.3))
      }
      if (lens.x < -100) { lens.x = lens.tx; lens.y = lens.ty }
      var ease = idle ? 0.04 : 0.28
      lens.x += (lens.tx - lens.x) * ease
      lens.y += (lens.ty - lens.y) * ease

      seenFor += dt
      if (!sweeping && full < 1 && seenFor > 7) runFull()
      if (sweeping) {
        full = Math.min(1, full + dt / 1.6)
        var row = Math.floor(full * rows)
        for (var i = 0; i < row * cols; i++) if (owner[i] >= 0) rev[i] = 1
        if (full >= 1) {
          sweeping = false
          runBtn.textContent = '✓ 27 zones · 124 findings'; runBtn.classList.add('done')
        }
      }

      // Reveal under the lens; discovered tiles keep a faint tint.
      var lx = lens.x / tile, ly = lens.y / tile, R = lens.r
      var R2 = R * R
      var discovered = 0
      c.clearRect(0, 0, G.w, G.h)
      var gap = Math.max(1, Math.round(tile * 0.14))
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var i = y * cols + x
          var zi = owner[i]
          var d2 = (x + 0.5 - lx) * (x + 0.5 - lx) + (y + 0.5 - ly) * (y + 0.5 - ly)
          if (zi < 0) {
            if ((x + y) % 3 === 0 && (x * 7 + y) % 5 === 0) { c.fillStyle = A(T.ink, 0.18); c.fillRect(x * tile + tile / 2 - gap, y * tile + tile / 2 - gap, gap * 2, gap * 2) }
            continue
          }
          if (full < 1) {
            if (d2 < R2) rev[i] = Math.min(1, rev[i] + 0.25)
            else if (rev[i] > 0.34) rev[i] -= 0.012
          }
          if (rev[i] > 0.3) discovered++
          var v = rev[i]
          var h = hash(i)
          if (v < 0.05) {
            // Unscanned: ink dither.
            c.fillStyle = A(T.ink, (0.1 + h * 0.14).toFixed(3))
          } else {
            c.fillStyle = zones[zi].color
            c.globalAlpha = Math.min(1, 0.18 + v * 0.82)
          }
          c.fillRect(x * tile, y * tile, tile - gap, tile - gap)
          if (v >= 0.05 && h > 0.82) { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x * tile, y * tile, tile - gap, tile - gap) }
          c.globalAlpha = 1
        }
      }

      // Import crossings, once the whole graph is known.
      if (full >= 1) {
        c.fillStyle = A(T.ink, 0.55)
        MAP.crossings.slice(0, 12).forEach(function (x, k) {
          var a = zones[byId[x.from]], b = zones[byId[x.to]]
          if (!a || !b) return
          var steps = Math.max(8, Math.round(Math.hypot(b.cx - a.cx, b.cy - a.cy)))
          var w = Math.max(1, Math.round(tile * (x.n > 150 ? 0.36 : 0.22)))
          for (var s = 0; s <= steps; s++) {
            if ((s + Math.floor(now * 8) + k) % 3) continue
            var px = (a.cx + (b.cx - a.cx) * (s / steps)) * tile + tile / 2
            var py = (a.cy + (b.cy - a.cy) * (s / steps)) * tile + tile / 2
            c.fillRect(px - w / 2, py - w / 2, w, w)
          }
        })
      }

      // Scan line.
      if (sweeping) {
        var sy = full * rows * tile
        c.fillStyle = '#00e0b0'
        c.fillRect(0, sy, G.w, Math.max(2, tile * 0.4))
        c.fillStyle = 'rgba(0,224,176,.14)'
        c.fillRect(0, sy - tile * 4, G.w, tile * 4)
      }

      // Finding pins.
      var blink = Math.floor(now * 3) % 2
      pins.forEach(function (p) {
        var near = (p.x - lx) * (p.x - lx) + (p.y - ly) * (p.y - ly) < R2 * 1.2
        var visible = full >= 1 || rev[p.i] > 0.3 || near
        if (!visible) return
        var col = p.f.severity === 'critical' ? '#ff4d1f' : '#ffb020'
        var bx = p.x * tile, by = p.y * tile - tile * 3
        c.fillStyle = T.ink
        c.fillRect(bx - tile * 0.5, by - tile * 0.5, tile * 2, tile * 3.2)
        c.fillStyle = blink || near ? col : T.paper
        c.fillRect(bx, by, tile, tile * 1.4)
        c.fillRect(bx, by + tile * 1.8, tile, tile * 0.6)
        c.fillStyle = T.ink
        c.fillRect(bx + tile * 0.25, by + tile * 2.7, tile * 0.5, tile * 0.9)
        if (near && !idle) showCallout(p)
        else if (!(full >= 1 && cycle.i % pins.length === pins.indexOf(p))) hideCallout(p.k)
      })
      if (full >= 1) {
          // Zone labels for the zones big enough to hold one.
          c.font = Math.round(10 * G.dpr) + 'px "Geist Mono", monospace'
          c.textBaseline = 'middle'
          zones.forEach(function (z) {
            if (z.tiles.length < (G.cw < 500 ? 60 : 26)) return
            var tw = c.measureText(z.id).width + 8 * G.dpr
            var zx = z.cx * tile - tw / 2, zy = z.cy * tile - 8 * G.dpr
            c.fillStyle = A(T.paper, 0.94)
            c.fillRect(zx, zy, tw, 16 * G.dpr)
            c.fillStyle = T.ink
            c.fillText(z.id, zx + 4 * G.dpr, zy + 8.5 * G.dpr)
          })
      }
      // After the full scan, walk through the findings one at a time.
      if (full >= 1 && (idle || !pointer.active)) {
        cycle.t += dt
        if (cycle.t > 3.2) { cycle.t = 0; cycle.i++ }
        var cp = pins[cycle.i % pins.length]
        if (cp) { showCallout(cp); lens.tx = cp.x * tile; lens.ty = cp.y * tile }
      }

      // Lens: a pixel circle with crosshair ticks.
      c.fillStyle = T.ink
      var steps2 = 64
      for (var a = 0; a < steps2; a++) {
        var ang = (a / steps2) * Math.PI * 2
        var qx = Math.round(lx + Math.cos(ang) * R), qy = Math.round(ly + Math.sin(ang) * R)
        c.fillRect(qx * tile + tile * 0.3, qy * tile + tile * 0.3, tile * 0.4, tile * 0.4)
      }
      c.fillRect(lens.x - tile * 1.5, lens.y - 1 * G.dpr, tile * 3, 2 * G.dpr)
      c.fillRect(lens.x - 1 * G.dpr, lens.y - tile * 1.5, 2 * G.dpr, tile * 3)

      // Rex follows the lens at a walk.
      var sc = Math.max(2, Math.round(tile / 3.2))
      var rw = REX.w * sc, rh = REX.h * sc
      // Face the lens, with a dead zone so he doesn't flip-flop beside it
      // (his target spot depends on which way he faces).
      var ahead = lens.x - (rex.x + rw / 2)
      if (Math.abs(ahead) > rw * 0.75) rex.face = ahead > 0 ? 1 : -1
      var gx = Math.min(G.w - rw, Math.max(0, lens.x - rw / 2 - lens.r * tile * 0.9 * rex.face))
      var gy = Math.min(G.h - rh, Math.max(0, lens.y + lens.r * tile * 0.5 - rh))
      var dx = gx - rex.x, dy = gy - rex.y
      var dist = Math.hypot(dx, dy)
      rex.walking = dist > 6 * G.dpr
      if (rex.walking) {
        var sp = Math.min(dist, 110 * G.dpr * dt)
        rex.x += (dx / dist) * sp
        rex.y += (dy / dist) * sp
      }
      var frame = rex.walking ? (Math.floor(now * 9) % 2 ? 'rex_walk0' : 'rex_walk1') : (Math.floor(now * 1.5) % 5 === 0 ? 'rex_idle1' : 'rex_idle0')
      c.fillStyle = A(T.ink, 0.18)
      c.fillRect(rex.x + sc * 2, rex.y + rh - sc, rw - sc * 4, sc * 2)
      P.draw(c, frame, rex.x, rex.y, sc, rex.face < 0)

      var pct = Math.round((discovered / Math.max(1, zoneTiles)) * 100)
      mappedEl.textContent = ('00' + pct).slice(-3)
    }

    build()
    onResize.push(function () { build() })
    if (reduce) { full = 1; rev.fill(1); runBtn.textContent = '✓ 27 zones · 124 findings'; runBtn.disabled = true; runBtn.classList.add('done') }
    animate(canvas, draw)
    if (reduce) draw(0, 0)
  })()

  // ═════════════ LOOP ═════════════
  var loopEl = document.querySelector('.loop')
  if (loopEl) (function () {
    var levels = [].slice.call(loopEl.querySelectorAll('.lv'))
    var navs = [].slice.call(loopEl.querySelectorAll('.loop-nav li'))
    var trackC = loopEl.querySelector('.track-canvas')

    // Split each terminal into lines so they can type in one at a time.
    loopEl.querySelectorAll('.crt-body[data-type]').forEach(function (pre) {
      pre.innerHTML = pre.innerHTML.split('\n').map(function (l) { return '<span class="ln">' + (l || '&nbsp;') + '</span>' }).join('')
    })
    function type(lv) {
      var pre = lv.querySelector('.crt-body[data-type]')
      if (!pre || reduce) return
      var lines = pre.querySelectorAll('.ln')
      clearInterval(pre._t)
      pre.classList.add('typing')
      lines.forEach(function (l) { l.classList.remove('shown') })
      var i = 0
      pre._t = setInterval(function () {
        if (i >= lines.length) { clearInterval(pre._t); return }
        lines[i++].classList.add('shown')
      }, 55)
    }

    var cur = -1, progress = 0
    function setStep(s) {
      if (s === cur) return
      cur = s
      levels.forEach(function (l, i) { l.classList.toggle('on', i === s) })
      navs.forEach(function (n, i) { n.classList.toggle('on', i === s); n.classList.toggle('done', i < s) })
      type(levels[s])
    }

    var desktop = window.matchMedia('(min-width: 961px)').matches
    if (desktop && window.gsap && window.ScrollTrigger && !reduce) {
      loopEl.classList.add('pinned')
      ScrollTrigger.create({
        trigger: loopEl.querySelector('.loop-pin'),
        start: 'top top',
        end: function () { return '+=' + window.innerHeight * 3.2 },
        pin: true,
        scrub: true,
        onUpdate: function (self) {
          progress = self.progress
          setStep(Math.min(3, Math.floor(progress * 4.001)))
        },
      })
      setStep(0)
      // The pin is measured now, but sprite canvases (sized on DOMContentLoaded)
      // and web fonts can still change the height of everything above it. Stale
      // start/end points make the pinned block release in the wrong place and
      // overlay other sections on the way back up, so re-measure on any change.
      var lastH = 0, rt
      var remeasure = function () {
        var h = document.documentElement.scrollHeight
        if (h === lastH) return
        lastH = h
        clearTimeout(rt)
        rt = setTimeout(function () { ScrollTrigger.refresh() }, 120)
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh() })
      if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body)
    } else {
      levels.forEach(function (l) { l.classList.add('on') })
      if ('IntersectionObserver' in window && !reduce) {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) { type(e.target); io.unobserve(e.target) } })
        }, { threshold: 0.3 })
        levels.forEach(function (l) { io.observe(l) })
      }
    }

    // Level track: ground, four flags, coins, and Rex walking to your scroll.
    if (trackC) {
      var rx = 0, lastRx = 0, walkT = 0
      animate(trackC, function (t, dt) {
        var T = TH()
        var g = fit(trackC)
        var c = g.ctx, s = Math.max(2, Math.round(3 * g.dpr))
        c.clearRect(0, 0, g.w, g.h)
        var ground = g.h - s * 4
        for (var x = 0; x < g.w; x += s * 4) {
          c.fillStyle = (x / (s * 4)) % 2 ? T.ink : T.ink2
          c.fillRect(x, ground, s * 4, s * 2)
        }
        var pad = 40 * g.dpr
        var span = g.w - pad * 2
        var labels = ['1-1', '1-2', '1-3', '1-4']
        c.font = Math.round(11 * g.dpr) + 'px Silkscreen, monospace'
        c.textBaseline = 'alphabetic'
        for (var k = 0; k < 4; k++) {
          var fx = pad + span * ((k + 0.5) / 4)
          var reached = progress >= (k + 0.02) / 4
          P.draw(c, 'flag', fx, ground - 10 * s, s, false)
          c.fillStyle = reached ? T.purple : T.mute
          c.fillText(labels[k], fx + 9 * s, ground - 6 * s)
          // Coins between flags, collected as Rex passes.
          for (var j = 1; j < 4; j++) {
            var cx = fx + (span / 4) * (j / 4)
            if (k === 3 || rx > cx) continue
            var bob = Math.floor(t / 250 + j) % 2 ? 0 : s
            P.draw(c, 'coin', cx, ground - 16 * s - bob, s, false)
          }
        }
        var target = pad + span * (0.5 / 4) + span * (3 / 4) * Math.min(1, progress * 1.02)
        rx += (target - rx) * 0.2
        var moving = Math.abs(rx - lastRx) > 0.4
        lastRx = rx
        walkT += dt
        var fr = moving ? (Math.floor(walkT * 10) % 2 ? 'rex_walk0' : 'rex_walk1') : 'rex_idle0'
        P.draw(c, fr, rx - 10 * s, ground - REX.h * s, s, false)
      })
    }
  })()

  // ═════════════ ISO MAP PANEL (loop level 1-4) ═════════════
  // Blocks rise layer by layer when the level opens, then the selection walks
  // through zones with warnings, filling the dossier from the real model.
  var isoView = document.querySelector('.isoview')
  if (isoView && window.NDXIso) (function () {
    var I = window.NDXIso
    var canvas = isoView.querySelector('.iso-canvas')
    var lv = isoView.closest('.lv')
    var els = {
      stage: isoView.querySelector('.iso-stage'), name: isoView.querySelector('.iso-name'), sub: isoView.querySelector('.iso-sub'),
      chips: isoView.querySelector('.iso-chips'), findings: isoView.querySelector('.iso-findings'),
    }
    // Production zones with something to say; test zones import everything,
    // so their arcs would fill the screen.
    var tour = I.data.nodes.filter(function (n) { return n.findings.length && n.kind !== 'tests' }).sort(function (a, b) { return b.files - a.files }).slice(0, 8)
    var maxCol = I.data.nodes.reduce(function (m, n) { return Math.max(m, n.u) }, 1)
    var opened = -1, step = -1
    function dossier(n) {
      var kind = I.data.kinds.filter(function (k) { return k.id === n.kind })[0]
      els.stage.textContent = (kind ? kind.glyph + ' ' : '') + n.stage + ' · ' + (kind ? kind.label : n.kind)
      els.name.textContent = n.id
      els.sub.textContent = n.files.toLocaleString('en-US') + ' files · ' + n.lines.toLocaleString('en-US') + ' lines'
      els.chips.innerHTML = '<span>cohesion <b>' + n.cohesion + '</b></span><span>coupling <b>' + n.coupling + '</b></span>'
      els.findings.innerHTML = ''
      ;(n.findings.length ? n.findings.slice(0, 2) : [{ text: 'No warnings.', severity: 'none' }]).forEach(function (f) {
        var li = document.createElement('li')
        li.className = f.severity
        li.textContent = f.text.length > 120 ? f.text.slice(0, f.text.lastIndexOf(' ', 118)) + '…' : f.text
        els.findings.appendChild(li)
      })
    }
    animate(canvas, function (t, dt, still) {
      var g = fit(canvas)
      var isOn = !lv || lv.classList.contains('on')
      if (isOn && opened < 0) opened = t
      if (!isOn) opened = -1
      var el = still ? 99 : (t - (opened < 0 ? t : opened)) / 1000
      var focusStep = el < 2.2 ? -1 : Math.floor((el - 2.2) / 3.2) % tour.length
      if (focusStep !== step) { step = focusStep; dossier(focusStep < 0 ? tour[0] : tour[focusStep]) }
      I.draw(g.ctx, g.w, g.h, {
        dpr: g.dpr,
        zoom: 1.1,
        rise: function (n) { var start = (n.u / maxCol) * 1.1; return Math.min(1, Math.max(0, (el - start) / 0.5)) },
        flow: el > 1.6 ? el : null,
        focus: focusStep >= 0 ? tour[focusStep].id : null,
        labels: function (n) { return n.files >= 40 || (focusStep >= 0 && n.id === tour[focusStep].id) },
      })
    })
  })()

  // ═════════════ BENTO: PRD tree ═════════════
  var treeEl = document.querySelector('.tree-viz')
  if (treeEl) (function () {
    var rows = [
      ['.rex/prd_tree/', 'dir', -1],
      ['├─ core-note-management/', 'dir', -1],
      ['│  ├─ index.md', 'md', -1],
      ['│  └─ note-storage-and-editor/', 'dir', -1],
      ['│     ├─ build-note-editor/', 'dir', 0],
      ['│     └─ design-note-data-model/', 'dir', 1],
      ['├─ llm-powered-auto-tagging/', 'dir', -1],
      ['│  └─ llm-tag-suggestion/', 'dir', -1],
      ['│     ├─ integrate-llm-api/', 'dir', 2],
      ['│     └─ tag-review-ui/', 'dir', 3],
      ['└─ note-relationships/', 'dir', -1],
      ['   └─ timeline-view/', 'dir', 4],
    ]
    var W = 34
    var state = [0, 0, 0, 0, 0], step = 0
    function render() {
      var html = rows.map(function (r) {
        var txt = r[0]
        var pad = new Array(Math.max(1, W - txt.length)).join(' ')
        var st = r[2] >= 0 ? '<i class="st ' + ['', 'prog', 'done'][state[r[2]]] + '"></i>' : ''
        return '<span class="' + r[1] + '">' + txt + '</span>' + (st ? pad + st : '')
      }).join('\n')
      var last = state.lastIndexOf(2)
      var diff = last >= 0 ? '\n\n<span class="md">M  …/' + rows.filter(function (r) { return r[2] === last })[0][0].replace(/[│├└─ ]/g, '') + 'index.md</span>\n<span class="md">-  status: in_progress</span>\n<span style="color:#00e0b0">+  status: completed</span>' : '\n\n<span class="md">git status: clean</span>'
      treeEl.innerHTML = html + diff
    }
    render()
    if (reduce) { state = [2, 2, 1, 0, 0]; render(); return }
    var io = new IntersectionObserver(function (e) { treeEl._on = e[0].isIntersecting }, {})
    io.observe(treeEl)
    setInterval(function () {
      if (!treeEl._on) return
      var k = Math.floor(step / 2)
      if (k >= 5) { state = [0, 0, 0, 0, 0]; step = 0 }
      else { state[k] = (step % 2) + 1; step++ }
      render()
    }, 1100)
  })()

  // ═════════════ BENTO: parallel worktrees ═════════════
  var lanesC = document.querySelector('.lanes-canvas')
  if (lanesC) (function () {
    var lanes = [
      { name: 'main', x: 0, speed: 34, task: 0, done: 0 },
      { name: 'wt-auth', x: 60, speed: 28, task: 1, done: 0 },
      { name: 'wt-search', x: 20, speed: 40, task: 2, done: 0 },
    ]
    var next = 3
    animate(lanesC, function (t, dt) {
      var T = TH()
      var g = fit(lanesC)
      var c = g.ctx, s = Math.max(1, Math.round(1.6 * g.dpr))
      c.clearRect(0, 0, g.w, g.h)
      var lh = g.h / lanes.length
      c.font = Math.round(10 * g.dpr) + 'px "Geist Mono", monospace'
      lanes.forEach(function (l, i) {
        var base = lh * (i + 1) - 6 * g.dpr
        c.fillStyle = A(T.ink, 0.25)
        for (var x = 0; x < g.w; x += 6 * g.dpr) c.fillRect(x, base, 3 * g.dpr, 1 * g.dpr)
        c.fillStyle = T.mute
        c.fillText(l.name, 0, base - lh + 20 * g.dpr)
        var goal = g.w - 40 * g.dpr
        l.x += l.speed * g.dpr * (dt || 0.016)
        var fx = goal
        if (l.x > goal - 34 * g.dpr) { l.x = 0; l.done++; l.task = next++ }
        P.draw(c, 'flag', fx, base - 10 * s, s, false)
        c.fillStyle = T.purple
        c.fillText('task #' + (l.task + 1) + ' · claimed', fx - 108 * g.dpr, base - lh + 20 * g.dpr)
        var fr = Math.floor(t / 110) % 2 ? 'rex_walk0' : 'rex_walk1'
        P.draw(c, fr, l.x, base - REX.h * s, s, false)
      })
    })
  })()

  // ═════════════ BENTO: MCP tool roll ═════════════
  var mcp = document.querySelector('.mcp-track')
  if (mcp) {
    var rexTools = 'get_prd_status get_next_task claim_task release_task update_task_status add_item edit_item get_item move_item merge_items get_recommendations verify_criteria reorganize health facets append_log sync_with_remote get_token_usage get_capabilities'.split(' ')
    var svTools = 'get_overview get_next_steps get_zone get_findings get_file_info search_files get_imports get_classifications set_file_archetype get_route_tree'.split(' ')
    var all = []
    for (var i = 0; i < 19; i++) { all.push(['rex', rexTools[i]]); if (svTools[i]) all.push(['sv', svTools[i]]) }
    var html = all.map(function (x) { return '<span class="' + x[0] + '">' + (x[0] === 'rex' ? 'rex.' : 'sv.') + x[1] + '</span>' }).join('')
    mcp.innerHTML = html + html
  }

  // ═════════════ BENTO: tokens per PRD item ═════════════
  var tokC = document.querySelector('.tokens-canvas')
  if (tokC) (function () {
    var items = [['note editor', 0.92], ['data model', 0.55], ['llm api', 0.74], ['review ui', 0.4], ['timeline', 0.22]]
    var grow = 0
    animate(tokC, function (t, dt, still) {
      var T = TH()
      var g = fit(tokC)
      var c = g.ctx
      grow = still ? 1 : Math.min(1, grow + (dt || 0) * 0.6)
      c.clearRect(0, 0, g.w, g.h)
      var bh = Math.floor((g.h - 10 * g.dpr) / items.length)
      var lw = 84 * g.dpr
      var cell = Math.max(4, Math.round(7 * g.dpr))
      c.font = Math.round(10.5 * g.dpr) + 'px "Geist Mono", monospace'
      c.textBaseline = 'middle'
      items.forEach(function (it, i) {
        var y = i * bh + 4 * g.dpr
        c.fillStyle = T.ink2
        c.fillText(it[0], 0, y + bh / 2)
        var maxCells = Math.floor((g.w - lw) / (cell + 2 * g.dpr))
        var n = Math.floor(maxCells * it[1] * Math.min(1, grow * 1.4 - i * 0.08))
        for (var k = 0; k < maxCells; k++) {
          c.fillStyle = k < n ? (k > maxCells * 0.8 ? '#ff4d1f' : k % 2 ? '#6a3df0' : '#4522b8') : A(T.ink, 0.08)
          c.fillRect(lw + k * (cell + 2 * g.dpr), y + bh / 2 - cell, cell, cell * 2 - 2 * g.dpr)
        }
      })
    })
  })()

  // ═════════════ BENTO: self-heal ring ═════════════
  var healC = document.querySelector('.heal-canvas')
  if (healC) (function () {
    var nodes = ['analyze', 'recommend', 'execute', 'acknowledge']
    var a = 0, iter = 1
    animate(healC, function (t, dt) {
      var T = TH()
      var g = fit(healC)
      var c = g.ctx
      c.clearRect(0, 0, g.w, g.h)
      var cx = g.w / 2, cy = g.h / 2, R = Math.min(g.w * 0.38, g.h * 0.36)
      var tl = Math.max(3, Math.round(4 * g.dpr))
      c.fillStyle = A(T.ink, 0.3)
      for (var k = 0; k < 90; k++) {
        if (k % 2) continue
        var an = (k / 90) * Math.PI * 2
        c.fillRect(Math.round((cx + Math.cos(an) * R) / tl) * tl, Math.round((cy + Math.sin(an) * R) / tl) * tl, tl, tl)
      }
      a += (dt || 0) * 0.9
      if (a > Math.PI * 2) { a -= Math.PI * 2; iter = iter % 3 + 1 }
      c.font = Math.round(10 * g.dpr) + 'px "Geist Mono", monospace'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      nodes.forEach(function (n, i) {
        var an = (i / 4) * Math.PI * 2 - Math.PI / 2
        var x = cx + Math.cos(an) * R, y = cy + Math.sin(an) * R
        var hot = Math.abs(((a - Math.PI / 2 - an + Math.PI * 4) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.5
        c.fillStyle = hot ? T.purple : T.ink
        c.fillRect(x - tl * 2, y - tl * 2, tl * 4, tl * 4)
        c.fillStyle = T.ink2
        c.fillText(n, x, y + (Math.sin(an) >= 0 ? tl * 5 : -tl * 5))
      })
      var ra = a - Math.PI / 2
      P.draw(c, 'coin', cx + Math.cos(ra) * R - 4 * tl / 2, cy + Math.sin(ra) * R - 4 * tl / 2, Math.max(1, tl / 2), false)
      c.font = Math.round(18 * g.dpr) + 'px Silkscreen, monospace'
      c.fillStyle = T.ink
      c.fillText('ITER ' + iter + '/3', cx, cy)
      c.textAlign = 'left'
    })
  })()

  // ═════════════ USE CASES ═════════════
  var caseEls = [].slice.call(document.querySelectorAll('.case'))
  if (caseEls.length) (function () {
    var titleEl = document.querySelector('[data-case-title]')
    var cmdEl = document.querySelector('[data-case-cmd]')
    var canvas = document.querySelector('.case-canvas')
    var TITLES = ['vibe-coded cleanup', 'onboarding', 'spec-driven work', 'keeping current', 'team leads']
    var CMDS = [
      '$ ndx analyze .\n$ ndx recommend --accept .\n$ ndx work --auto .',
      '$ ndx analyze .\n$ less .sourcevision/CONTEXT.md\n$ ndx start .',
      '$ ndx add "Add SSO support" .\n$ ndx work --auto .\n$ ndx status .',
      '$ ndx self-heal 3 .',
      '$ ndx ci .\n$ ndx sync .\n$ ndx start .',
    ]
    var active = 0, t0 = 0, typeT
    function typeCmd(s) {
      clearInterval(typeT)
      if (reduce) { cmdEl.textContent = s; return }
      var i = 0
      typeT = setInterval(function () {
        cmdEl.innerHTML = s.slice(0, ++i).replace(/\$/g, '<span class="c-m">$</span>') + '<span class="caret"></span>'
        if (i >= s.length) clearInterval(typeT)
      }, 24)
    }
    function set(i) {
      active = i
      t0 = performance.now()
      caseEls.forEach(function (el, k) {
        el.classList.toggle('on', k === i)
        el.querySelector('button').setAttribute('aria-expanded', k === i)
      })
      titleEl.textContent = TITLES[i]
      typeCmd(CMDS[i])
    }
    caseEls.forEach(function (el, i) {
      el.querySelector('button').addEventListener('click', function () { set(i) })
      el.addEventListener('mouseenter', function () { if (window.matchMedia('(hover: hover)').matches && active !== i) set(i) })
    })
    set(0)

    // Every scene is the same real iso map, animated to tell its case.
    var I = window.NDXIso
    if (!I) return
    var nodes = I.data.nodes
    var maxU = nodes.reduce(function (m, n) { return Math.max(m, n.u) }, 1)
    var ease = function (x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3) }
    var byWork = nodes.slice().sort(function (a, b) { return b.lines - a.lines })
    var grey = '#3a3960'

    animate(canvas, function (t, dt, still) {
      var g = fit(canvas)
      var el = still ? 6 : (performance.now() - t0) / 1000
      var o = { dpr: g.dpr, pad: 22, labels: function (n) { return n.files >= 90 } }

      if (active === 0) {
        // Cleanup: a scattered, flagged codebase settles into its layers.
        var cyc = el % 8
        var p = ease((cyc - 0.6) / 2.6) * (cyc > 7.3 ? 1 - (cyc - 7.3) / 0.7 : 1)
        o.offset = function (n) { return { u: (hash(n.i) - 0.5) * 50 * (1 - p), v: (hash(n.i + 50) - 0.5) * 30 * (1 - p) } }
        o.rise = function (n) { return 0.35 + 0.65 * (p + (1 - p) * hash(n.i + 9)) }
        o.badge = function (n) { return p < 0.9 && n.findings.some(function (f) { return f.severity === 'warning' }) && hash(n.i + 3) > 0.45 ? 'warn' : null }
        o.labels = function (n) { return p > 0.95 && n.files >= 90 }
      } else if (active === 1) {
        // Onboarding: the map assembles layer by layer, then comes alive.
        var cyc1 = el % 9
        o.rise = function (n) { return ease((cyc1 - (n.u / maxU) * 2.4) / 0.6) }
        o.flow = cyc1 > 3 ? el : null
        o.labels = function (n) { return n.files >= 40 && cyc1 > (n.u / maxU) * 2.4 + 0.5 }
      } else if (active === 2) {
        // Spec-driven: work lands zone by zone, each one checked off.
        var done = Math.floor(el / 0.9) % (byWork.length + 3)
        var visited = {}
        byWork.slice(0, done).forEach(function (n) { visited[n.id] = true })
        var cur = byWork[done]
        o.alpha = function (n) { return visited[n.id] || (cur && n.id === cur.id) ? 1 : 0.35 }
        o.badge = function (n) { return visited[n.id] ? 'ok' : null }
        o.labels = function (n) { return cur && n.id === cur.id }
      } else if (active === 3) {
        // Keeping current: code churns ahead of the sweep; behind it the map is
        // re-derived and settled.
        var sw = (el % 4) / 4
        var B = I.data.bounds
        o.sweep = sw
        o.rise = function (n) {
          var ahead = (n.u - B.uMin) / (B.uMax - B.uMin) > sw
          return ahead && hash(n.i + 7) > 0.6 ? 0.75 + 0.25 * Math.sin(el * 3 + n.i) : 1
        }
        o.color = function (n) { return (n.u - B.uMin) / (B.uMax - B.uMin) > sw && hash(n.i + 7) > 0.6 ? '#e0a33e' : null }
      } else {
        // Team leads: progress fills the map layer by layer, checked in CI.
        var cyc4 = el % 8
        var filled = function (n) { return cyc4 > 0.5 + (n.u / maxU) * 4 }
        o.color = function (n) { return filled(n) ? null : grey }
        o.badge = function (n) { return filled(n) && n.files >= 90 ? 'ok' : null }
        o.flow = el
      }
      I.draw(g.ctx, g.w, g.h, o)
    })
  })()

  // ═════════════ SHIP-IT MINI GAME ═════════════
  var gameC = document.querySelector('.game-canvas')
  if (gameC) (function () {
    var scoreEl = document.querySelector('.game-score b')
    var W = 240, H = 120, GROUND = 100
    var low = document.createElement('canvas')
    low.width = W; low.height = H
    // Low-res buffer sized to the screen's aspect at a whole-number scale,
    // so the pixels stay square and the game fills its CRT.
    function sizeLow(g) {
      var k = Math.max(2, Math.floor(g.h / 110))
      var h = Math.floor(g.h / k), w = Math.floor(g.w / k)
      if (w !== W || h !== H) { W = low.width = w; H = low.height = h; GROUND = H - 22; if (st) st.y = Math.min(st.y, GROUND - REX.h) }
      return k
    }
    var lc = low.getContext('2d')
    var st
    function reset(demo) {
      st = { demo: demo, over: false, started: !demo, y: GROUND - REX.h, vy: 0, speed: 70, obs: [], coins: [], spawn: 1.2, cspawn: 0.8, score: 0, dist: 0, t: 0, clouds: [[30, 20], [120, 34], [200, 16]] }
    }
    reset(true)
    var best = 0
    try { best = +localStorage.getItem('ndx-ship-best') || 0 } catch (e) {}
    function jump() {
      if (st.demo || st.over) { reset(false); return }
      if (st.y >= GROUND - REX.h - 0.5) st.vy = -150
    }
    gameC.addEventListener('pointerdown', function (e) { e.preventDefault(); gameC.focus({ preventScroll: true }); jump() })
    gameC.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); jump() }
    })
    function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y }

    animate(gameC, function (t, dt, still) {
      var g = fit(gameC, 1)
      var c = g.ctx
      var K = sizeLow(g)
      dt = dt || 0.016
      if (!st.over) {
        st.t += dt
        st.dist += st.speed * dt
        st.speed = Math.min(170, 70 + st.t * 2.2)
        st.vy += 420 * dt
        st.y = Math.min(GROUND - REX.h, st.y + st.vy * dt)
        if (st.y >= GROUND - REX.h) st.vy = 0
        st.spawn -= dt
        if (st.spawn <= 0) { st.obs.push({ x: W + 4, y: GROUND - 10, w: 12, h: 10 }); st.spawn = 1.1 + Math.random() * 1.3 - Math.min(0.5, st.t / 60) }
        st.cspawn -= dt
        if (st.cspawn <= 0) { st.coins.push({ x: W + 4, y: GROUND - 44 - Math.random() * 18, w: 8, h: 8 }); st.cspawn = 1.4 + Math.random() * 1.6 }
        var rexBox = { x: 17, y: st.y + 2, w: 13, h: 13 }
        st.obs.forEach(function (o) { o.x -= st.speed * dt })
        st.coins.forEach(function (o) { o.x -= st.speed * dt })
        st.obs = st.obs.filter(function (o) { return o.x > -20 })
        // Demo mode plays itself.
        if (st.demo) {
          var nx = st.obs.filter(function (o) { return o.x > 20 })[0]
          if (nx && nx.x - 38 < st.speed * 0.22 && st.y >= GROUND - REX.h) st.vy = -150
        }
        st.coins = st.coins.filter(function (o) {
          if (hit(rexBox, o)) { st.score++; return false }
          return o.x > -20
        })
        if (st.obs.some(function (o) { return hit(rexBox, { x: o.x + 2, y: o.y + 2, w: o.w - 4, h: o.h - 2 }) })) {
          if (st.demo) { reset(true) } else {
            st.over = true
            if (st.score > best) { best = st.score; try { localStorage.setItem('ndx-ship-best', best) } catch (e) {} }
          }
        }
      }
      // draw at 240×120, then scale up with no smoothing
      lc.fillStyle = '#121019'
      lc.fillRect(0, 0, W, H)
      lc.fillStyle = '#2a2733'
      st.clouds.forEach(function (cl) {
        cl[0] -= st.over ? 0 : st.speed * 0.15 * dt
        if (cl[0] < -30) cl[0] = W + 10
        lc.fillRect(Math.round(cl[0]), cl[1], 18, 4)
        lc.fillRect(Math.round(cl[0]) + 4, cl[1] - 3, 10, 3)
      })
      // Far skyline of zone blocks.
      for (var i = 0; i < Math.ceil(W / 23) + 2; i++) {
        var bx = ((i * 23 - st.dist * 0.3) % (W + 40) + W + 40) % (W + 40) - 20
        var bh = 8 + (hash(i) * 22) | 0
        lc.fillStyle = ['#241f33', '#1e2a3a', '#2d2440'][i % 3]
        lc.fillRect(Math.round(bx), GROUND - bh, 16, bh)
      }
      lc.fillStyle = '#6a3df0'
      lc.fillRect(0, GROUND, W, 1)
      for (var gx = 0; gx < W; gx += 6) {
        lc.fillStyle = '#3a3548'
        lc.fillRect(Math.round((gx - st.dist) % W + W) % W, GROUND + 4 + ((gx * 7) % 3) * 4, 2, 1)
      }
      st.coins.forEach(function (o) { P.draw(lc, 'coin', o.x, o.y, 1, false) })
      st.obs.forEach(function (o) { P.draw(lc, 'bug', o.x, o.y, 1, false) })
      var airborne = st.y < GROUND - REX.h - 0.5
      var fr = st.over ? 'rex_idle1' : airborne ? 'rex_jump' : Math.floor(st.t * 10) % 2 ? 'rex_walk0' : 'rex_walk1'
      P.draw(lc, fr, 16, Math.round(st.y), 1, false)
      lc.font = '8px Silkscreen, monospace'
      lc.textBaseline = 'top'
      lc.fillStyle = '#8f89a8'
      lc.fillText('BEST ' + ('00' + best).slice(-3), 4, 4)
      lc.textAlign = 'center'
      if (st.demo) {
        if (Math.floor(t / 500) % 2) { lc.fillStyle = '#00e0b0'; lc.fillText('CLICK OR PRESS SPACE TO PLAY', W / 2, H * 0.28) }
        lc.fillStyle = '#8f89a8'
        lc.fillText('DEMO', W / 2, H * 0.28 + 14)
      }
      if (st.over) {
        lc.fillStyle = '#ff7a52'
        lc.fillText('BUG IN PROD', W / 2, H * 0.28)
        lc.fillStyle = '#d9d4ee'
        lc.fillText('SHIPPED ' + st.score + ' · SPACE TO RETRY', W / 2, H * 0.28 + 14)
      }
      lc.textAlign = 'left'
      scoreEl.textContent = ('00' + st.score).slice(-3)
      c.fillStyle = '#121019'
      c.fillRect(0, 0, g.w, g.h)
      c.imageSmoothingEnabled = false
      c.drawImage(low, Math.round((g.w - W * K) / 2), Math.round((g.h - H * K) / 2), W * K, H * K)
    })
  })()
})()
