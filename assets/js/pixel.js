// Pixel renderer for n-dx.dev. Draws sprites from sprites.js and a small 5×7
// bitmap font onto canvases, and animates any <canvas data-sprite> on the page.
;(function () {
  var S = window.NDX_SPRITES
  if (!S) return
  var cache = {}

  // Pre-render each sprite once at 1× into an offscreen canvas; drawing then is
  // a single drawImage with smoothing off.
  function base(name, flip) {
    var key = name + (flip ? ':f' : '')
    if (cache[key]) return cache[key]
    var rows = S.SPRITES[name]
    if (!rows) return null
    var c = document.createElement('canvas')
    c.width = rows[0].length
    c.height = rows.length
    var x = c.getContext('2d')
    rows.forEach(function (row, y) {
      for (var i = 0; i < row.length; i++) {
        var ch = row[i]
        if (ch === '.') continue
        x.fillStyle = S.PALETTE[ch] || '#f0f'
        x.fillRect(flip ? row.length - 1 - i : i, y, 1, 1)
      }
    })
    return (cache[key] = c)
  }

  function draw(ctx, name, x, y, scale, flip) {
    var b = base(name, flip)
    if (!b) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(b, Math.round(x), Math.round(y), b.width * scale, b.height * scale)
  }

  function size(name) {
    var r = S.SPRITES[name]
    return r ? { w: r[0].length, h: r.length } : { w: 0, h: 0 }
  }

  // ── 5×7 bitmap font ─────────────────────────────────────────────
  var FONT = {
    n: ['.....', '.....', 'x.xx.', 'xx..x', 'x...x', 'x...x', 'x...x'],
    d: ['....x', '....x', '.xxxx', 'x...x', 'x...x', 'x...x', '.xxxx'],
    x: ['.....', '.....', 'x...x', '.x.x.', '..x..', '.x.x.', 'x...x'],
    '-': ['.....', '.....', '.....', 'xxxxx', '.....', '.....', '.....'],
    '0': ['.xxx.', 'x...x', 'x..xx', 'x.x.x', 'xx..x', 'x...x', '.xxx.'],
    '1': ['..x..', '.xx..', '..x..', '..x..', '..x..', '..x..', '.xxx.'],
    '2': ['.xxx.', 'x...x', '....x', '...x.', '..x..', '.x...', 'xxxxx'],
    '3': ['xxxx.', '....x', '....x', '.xxx.', '....x', '....x', 'xxxx.'],
    '4': ['...x.', '..xx.', '.x.x.', 'x..x.', 'xxxxx', '...x.', '...x.'],
    '5': ['xxxxx', 'x....', 'xxxx.', '....x', '....x', 'x...x', '.xxx.'],
    '6': ['.xxx.', 'x....', 'x....', 'xxxx.', 'x...x', 'x...x', '.xxx.'],
    '7': ['xxxxx', '....x', '...x.', '..x..', '.x...', '.x...', '.x...'],
    '8': ['.xxx.', 'x...x', 'x...x', '.xxx.', 'x...x', 'x...x', '.xxx.'],
    '9': ['.xxx.', 'x...x', 'x...x', '.xxxx', '....x', '....x', '.xxx.'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  }

  // Returns the lit cells of a string as [{x,y}], in font units.
  function textCells(str, gap) {
    gap = gap == null ? 1 : gap
    var cells = []
    var cx = 0
    for (var i = 0; i < str.length; i++) {
      var g = FONT[str[i]] || FONT[' ']
      for (var y = 0; y < 7; y++) for (var x = 0; x < 5; x++) if (g[y][x] === 'x') cells.push({ x: cx + x, y: y, ch: str[i] })
      cx += 5 + gap
    }
    return { cells: cells, w: cx - gap, h: 7 }
  }

  // ── auto-mount animated sprite canvases ───────────────────────────
  var mounted = []
  function mount(el) {
    if (el._px) return
    var frames = (el.dataset.frames || el.dataset.sprite).split(',')
    var scale = +el.dataset.scale || 4
    var sz = size(frames[0])
    var pad = +el.dataset.pad || 0
    el.width = (sz.w + pad * 2) * scale
    el.height = (sz.h + pad * 2) * scale
    el.classList.add('pixelated')
    var st = { el: el, frames: frames, scale: scale, pad: pad, fps: +el.dataset.fps || 4, t: 0, f: -1, flip: el.dataset.flip === '1', visible: true, bob: el.dataset.bob === '1' }
    el._px = st
    mounted.push(st)
    render(st, 0)
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { st.visible = e[0].isIntersecting }).observe(el)
    }
  }
  function render(st, f) {
    var ctx = st.el.getContext('2d')
    ctx.clearRect(0, 0, st.el.width, st.el.height)
    var yoff = st.bob && f % 2 ? -1 : 0
    draw(ctx, st.frames[f % st.frames.length], st.pad * st.scale, (st.pad + yoff) * st.scale, st.scale, st.flip)
  }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches
  function tick(now) {
    for (var i = 0; i < mounted.length; i++) {
      var st = mounted[i]
      if (!st.visible || st.frames.length < 2 && !st.bob) continue
      var f = Math.floor((now / 1000) * st.fps)
      if (f !== st.f) { st.f = f; render(st, f) }
    }
    requestAnimationFrame(tick)
  }

  function init() {
    document.querySelectorAll('canvas[data-sprite]').forEach(mount)
    if (!reduce) requestAnimationFrame(tick)
  }

  window.NDXPixel = { draw: draw, base: base, size: size, textCells: textCells, mount: mount, PALETTE: S.PALETTE, reduce: reduce }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
