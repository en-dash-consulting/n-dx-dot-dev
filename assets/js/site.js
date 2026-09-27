// Shared behaviour for every n-dx.dev page: boot sequence,
// pointer label, text scramble, reveals, word sweep, counters, copy buttons,
// nav, and the interactive pixel wordmark in the footer.
;(function () {
  var doc = document.documentElement
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var fine = window.matchMedia('(pointer: fine) and (hover: hover)').matches
  var hasGsap = !!(window.gsap && window.ScrollTrigger)
  if (hasGsap) gsap.registerPlugin(ScrollTrigger)

  // ── nav ───────────────────────────────────────────────────────────
  var nav = document.querySelector('.nav')
  if (nav) {
    var btn = nav.querySelector('.nav-toggle')
    btn && btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open')
      btn.setAttribute('aria-expanded', open)
    })
    nav.querySelectorAll('.nav-menu a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); btn && btn.setAttribute('aria-expanded', false) })
    })
    var lastY = 0
    window.addEventListener('scroll', function () {
      var y = window.scrollY
      if (!nav.classList.contains('open')) nav.classList.toggle('hide', y > 240 && y > lastY)
      lastY = y
    }, { passive: true })
  }

  // ── pointer label ─────────────────────────────────────────────────
  // A small tag that follows the pointer only where there is something to
  // name — the hero map sets window.ndxCursorLabel to the zone and file under
  // it. Everywhere else the native cursor is left alone.
  if (fine) {
    var tag = document.createElement('div')
    tag.className = 'ptag'
    tag.setAttribute('aria-hidden', 'true')
    document.body.appendChild(tag)
    var tx = 0, ty = 0, pend = false
    var paint = function () {
      pend = false
      var label = window.ndxCursorLabel || ''
      tag.classList.toggle('on', !!label)
      if (label) {
        tag.textContent = label
        tag.style.transform = 'translate(' + (tx + 16) + 'px,' + (ty + 14) + 'px)'
      }
    }
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY
      if (!pend) { pend = true; requestAnimationFrame(paint) }
    }, { passive: true })
    window.addEventListener('scroll', function () { tag.classList.remove('on') }, { passive: true })
  }

  // ── text scramble ─────────────────────────────────────────────────
  // Glyphs close to cap width, so a scrambling line barely reflows.
  var GLYPHS = 'ABDEHKMNRSUXZ#0123456789'
  // Scrambles text nodes only, so <br> and inline spans survive.
  function scramble(el, dur) {
    if (reduce || el._scr) return
    el._scr = true
    var nodes = []
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) nodes.push({ n: walker.currentNode, text: walker.currentNode.nodeValue })
    var len = nodes.reduce(function (a, x) { return a + x.text.length }, 0)
    var start = performance.now()
    dur = dur || Math.min(1100, 320 + len * 28)
    ;(function step(now) {
      var p = Math.min(1, (now - start) / dur)
      var at = 0
      nodes.forEach(function (x) {
        var out = ''
        for (var i = 0; i < x.text.length; i++, at++) {
          var ch = x.text[i]
          var reveal = at / len < p * 1.15 - 0.15
          out += reveal || /\s/.test(ch) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]
        }
        x.n.nodeValue = p < 1 ? out : x.text
      })
      if (p < 1) requestAnimationFrame(step)
    })(start)
  }
  window.ndxScramble = scramble

  // ── reveal observer ───────────────────────────────────────────────
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return
      var el = e.target
      el.classList.add('in')
      if (el.hasAttribute('data-scramble')) scramble(el)
      if (el.hasAttribute('data-count')) count(el)
      io.unobserve(el)
    })
  }, { rootMargin: '0px 0px -12% 0px' }) : null
  var revealables = document.querySelectorAll('[data-reveal],[data-stagger],[data-scramble],[data-count]')
  if (io && !reduce) revealables.forEach(function (el) { io.observe(el) })
  else revealables.forEach(function (el) { el.classList.add('in') })
  // Failsafe: never leave content hidden if an observer misfires.
  setTimeout(function () {
    document.querySelectorAll('[data-reveal]:not(.in),[data-stagger]:not(.in)').forEach(function (el) {
      var r = el.getBoundingClientRect()
      if (r.top < innerHeight && r.bottom > 0) el.classList.add('in')
    })
  }, 2500)

  // ── counters ──────────────────────────────────────────────────────
  function count(el) {
    var to = parseFloat(el.getAttribute('data-count'))
    var fmt = function (n) { return Math.round(n).toLocaleString('en-US') }
    if (reduce) { el.textContent = fmt(to); return }
    var t0 = performance.now(), d = 1400
    ;(function f(now) {
      var p = Math.min(1, (now - t0) / d)
      var e = 1 - Math.pow(1 - p, 4)
      // Stepped, like an arcade score counter.
      el.textContent = fmt(Math.floor(to * Math.round(e * 24) / 24))
      if (p < 1) requestAnimationFrame(f)
      else el.textContent = fmt(to)
    })(t0)
  }

  // ── word sweep (statement paragraphs light up with scroll) ────────
  document.querySelectorAll('.sweep').forEach(function (el) {
    var words = []
    ;(function split(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment()
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return }
            var s = document.createElement('span')
            s.className = 'w' + (node.classList && node.classList.contains('hl') ? ' hl' : '')
            s.textContent = part
            frag.appendChild(s)
            words.push(s)
          })
          node.replaceChild(frag, n)
        } else if (n.nodeType === 1) split(n)
      })
    })(el)
    if (reduce) { words.forEach(function (w) { w.classList.add('lit') }); return }
    var update = function () {
      var r = el.getBoundingClientRect()
      var p = (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)
      var lit = Math.floor(Math.max(0, Math.min(1, p)) * words.length * 1.05)
      for (var i = 0; i < words.length; i++) words[i].classList.toggle('lit', i < lit)
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
  })

  // ── copy buttons ──────────────────────────────────────────────────
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    var orig = b.innerHTML
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy')
      var done = function () {
        b.innerHTML = b.getAttribute('data-copied') || 'Copied'
        b.classList.add('copied')
        setTimeout(function () { b.innerHTML = orig; b.classList.remove('copied') }, 1600)
      }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done)
      else done()
    })
  })

  // ── boot sequence (landing page, once per session) ────────────────
  var boot = document.querySelector('.boot')
  var seen = false
  try { seen = sessionStorage.getItem('ndx-boot') === '1' } catch (e) {}
  function bootDone() {
    doc.classList.remove('booting')
    document.dispatchEvent(new CustomEvent('ndx:ready'))
  }
  if (boot && doc.classList.contains('booting') && !seen && !reduce) {
    try { sessionStorage.setItem('ndx-boot', '1') } catch (e) {}
    var items = boot.querySelectorAll('.boot-list li')
    var pct = boot.querySelector('.boot-pct span')
    var bar = boot.querySelector('.boot-bar i')
    var total = 1900, t0 = performance.now(), finished = false
    var finish = function () {
      if (finished) return
      finished = true
      wipe()
      bootDone()
    }
    boot.querySelector('.boot-skip').addEventListener('click', finish)
    ;(function step(now) {
      if (finished) return
      var p = Math.min(1, (now - t0) / total)
      // Stalls and bursts read as real work, not a CSS transition.
      var shown = Math.min(100, Math.floor(100 * (p < 0.5 ? p * 1.3 : 0.65 + (p - 0.5) * 0.7)))
      if (p === 1) shown = 100
      pct.textContent = shown
      bar.style.width = shown + '%'
      var k = Math.min(items.length, Math.floor(p * (items.length + 0.6)))
      items.forEach(function (li, i) {
        li.classList.toggle('on', i < k)
        li.classList.toggle('cur', i === k)
      })
      if (p < 1) requestAnimationFrame(step)
      else setTimeout(finish, 220)
    })(t0)
  } else {
    doc.classList.remove('booting')
    // Let page scripts start after this tick either way.
    setTimeout(bootDone, 0)
  }

  // Pixel dissolve: cover the screen in paper blocks, then knock them out on
  // a diagonal with jitter — the 8-bit version of a page transition.
  function wipe(cb) {
    var c = document.createElement('canvas')
    c.className = 'boot-wipe'
    document.body.appendChild(c)
    var dpr = 1
    var W = (c.width = innerWidth * dpr), H = (c.height = innerHeight * dpr)
    var sz = Math.max(18, Math.round(Math.min(W, H) / 22))
    var cols = Math.ceil(W / sz), rows = Math.ceil(H / sz)
    var cells = []
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) cells.push({ x: x, y: y, t: (x / cols + (rows - y) / rows) / 2 + Math.random() * 0.22 })
    var ctx = c.getContext('2d')
    var t0 = performance.now(), d = 720
    var colors = ['#e8e6df', '#e8e6df', '#e8e6df', '#6a3df0', '#16151c', '#00e0b0']
    ;(function f(now) {
      var p = (now - t0) / d
      ctx.clearRect(0, 0, W, H)
      for (var i = 0; i < cells.length; i++) {
        var cl = cells[i]
        var local = cl.t * 0.8
        if (p > local + 0.12) continue
        ctx.fillStyle = p > local ? colors[(i * 7) % colors.length] : '#e8e6df'
        ctx.fillRect(cl.x * sz, cl.y * sz, sz, sz)
      }
      if (p < 1.2) requestAnimationFrame(f)
      else { c.remove(); cb && cb() }
    })(t0)
  }

  // ── footer pixel wordmark: blocks scatter from the pointer ────────
  var fw = document.querySelector('.foot-word canvas')
  if (fw && window.NDXPixel) {
    var fctx = fw.getContext('2d')
    var parts = [], cell = 10, ox = 0, oy = 0, pw = { x: -9999, y: -9999 }, running = false, fdpr = Math.min(2, window.devicePixelRatio || 1)
    var layout = function () {
      var r = fw.getBoundingClientRect()
      fw.width = r.width * fdpr
      fw.height = r.height * fdpr
      var t = NDXPixel.textCells('n-dx', 1)
      cell = Math.floor(Math.min(fw.width / (t.w + 2), fw.height / (t.h + 1)))
      ox = Math.round((fw.width - t.w * cell) / 2)
      oy = Math.round((fw.height - t.h * cell) / 2)
      var old = parts
      parts = t.cells.map(function (c, i) {
        var hx = ox + c.x * cell, hy = oy + c.y * cell
        var o = old[i]
        return { hx: hx, hy: hy, x: o ? o.x : hx, y: o ? o.y : hy, vx: 0, vy: 0, dash: c.ch === '-' }
      })
      frame()
    }
    var frame = function () {
      fctx.clearRect(0, 0, fw.width, fw.height)
      var moving = false
      var R = cell * 5
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i]
        var dx = p.x + cell / 2 - pw.x, dy = p.y + cell / 2 - pw.y
        var d2 = dx * dx + dy * dy
        if (d2 < R * R && !reduce) {
          var d = Math.sqrt(d2) || 1
          var f = (1 - d / R) * cell * 0.9
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
        }
        p.vx += (p.hx - p.x) * 0.08
        p.vy += (p.hy - p.y) * 0.08
        p.vx *= 0.78
        p.vy *= 0.78
        p.x += p.vx
        p.y += p.vy
        if (Math.abs(p.vx) + Math.abs(p.vy) > 0.05 || Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy) > 0.5) moving = true
        var off = Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy)
        fctx.fillStyle = p.dash ? '#00e0b0' : off > cell * 0.6 ? '#6a3df0' : '#e8e6df'
        fctx.fillRect(Math.round(p.x), Math.round(p.y), cell - Math.max(1, cell * 0.08), cell - Math.max(1, cell * 0.08))
      }
      running = moving
      if (moving) requestAnimationFrame(frame)
    }
    fw.addEventListener('pointermove', function (e) {
      var r = fw.getBoundingClientRect()
      pw.x = (e.clientX - r.left) * fdpr
      pw.y = (e.clientY - r.top) * fdpr
      if (!running) { running = true; requestAnimationFrame(frame) }
    })
    fw.addEventListener('pointerleave', function () { pw.x = pw.y = -9999; if (!running) { running = true; requestAnimationFrame(frame) } })
    layout()
    var rt
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 150) })
  }
})()
