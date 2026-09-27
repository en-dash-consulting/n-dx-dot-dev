// Isometric architecture map renderer, drawn to match `ndx iso` (the
// sourcevision iso-map export): extruded blocks per zone, footprint from file
// count, height from line count, colour from the zone's dominant archetype,
// and import edges routed across the floor. The layout itself comes from the
// real iso model in iso-data.js — this file only projects and animates it.
;(function () {
  var DATA = window.NDX_ISO
  if (!DATA) return

  var BG = '#12122b'
  var C = Math.cos(Math.PI / 6), S = 0.5, Z = 0.78
  var kindColor = {}
  DATA.kinds.forEach(function (k) { kindColor[k.id] = k.color })
  var byId = {}
  DATA.nodes.forEach(function (n, i) { n.i = i; byId[n.id] = n })

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16)
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255
    var t = f < 0 ? 0 : 255, p = Math.abs(f)
    return 'rgb(' + Math.round((t - r) * p + r) + ',' + Math.round((t - g) * p + g) + ',' + Math.round((t - b) * p + b) + ')'
  }
  function label(id) { return id.replace(/-/g, ' ').toUpperCase() }

  // Painter's order: farther blocks (smaller u+v) first.
  var order = DATA.nodes.slice().sort(function (a, b) { return (a.u + a.v + a.w / 2 + a.d / 2) - (b.u + b.v + b.w / 2 + b.d / 2) })
  var maxH = DATA.nodes.reduce(function (m, n) { return Math.max(m, n.h) }, 0)

  // Scene → screen, fitted to the canvas with padding.
  function camera(w, h, pad, zoom) {
    var B = DATA.bounds
    var xMin = (B.uMin - B.vMax) * C, xMax = (B.uMax - B.vMin) * C
    var yMin = (B.uMin + B.vMin) * S - maxH * Z, yMax = (B.uMax + B.vMax) * S
    var s = Math.min((w - pad * 2) / (xMax - xMin), (h - pad * 2) / (yMax - yMin)) * (zoom || 1)
    var ox = (w - (xMax - xMin) * s) / 2 - xMin * s
    var oy = (h - (yMax - yMin) * s) / 2 - yMin * s
    return {
      s: s,
      p: function (u, v, z) { return [ox + (u - v) * C * s, oy + ((u + v) * S - (z || 0) * Z) * s] },
    }
  }

  function poly(ctx, pts) {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
  }

  // Draws one frame. `o` shapes the scene per use:
  //   rise(n)    0..1 extrusion multiplier        offset(n) {u, v} displacement
  //   alpha(n)   block opacity                    color(n)  override fill colour
  //   focus      zone id: dims the rest, lifts its edges into arcs
  //   flow       seconds for travelling dots on edges (omit for static)
  //   labels     true | fn(n) → bool               badge(n)  'ok' | 'warn' | null
  //   sweep      0..1 scan line across the floor   dpr       device pixel ratio
  //   zoom       >1 crops the empty floor margins
  function draw(ctx, w, h, o) {
    o = o || {}
    var dpr = o.dpr || 1
    var cam = camera(w, h, (o.pad || 18) * dpr, o.zoom)
    var P = cam.p
    var B = DATA.bounds
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    // Floor plane and grid.
    poly(ctx, [P(B.uMin - 2, B.vMin - 2), P(B.uMax + 2, B.vMin - 2), P(B.uMax + 2, B.vMax + 2), P(B.uMin - 2, B.vMax + 2)])
    ctx.fillStyle = 'rgba(44,43,96,0.45)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(120,118,200,0.10)'
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    for (var gu = B.uMin; gu <= B.uMax + 2; gu += 5) { var a = P(gu, B.vMin - 2), b = P(gu, B.vMax + 2); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]) }
    for (var gv = B.vMin; gv <= B.vMax + 2; gv += 5) { var c = P(B.uMin - 2, gv), d = P(B.uMax + 2, gv); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]) }
    ctx.stroke()

    if (o.sweep != null) {
      var su = B.uMin + (B.uMax - B.uMin + 4) * o.sweep - 2
      var s1 = P(su, B.vMin - 2), s2 = P(su, B.vMax + 2)
      ctx.strokeStyle = 'rgba(0,224,176,0.9)'
      ctx.lineWidth = 2 * dpr
      ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke()
    }

    var focus = o.focus && byId[o.focus]
    var off = function (n) { return o.offset ? o.offset(n) : null }
    var nu = function (n) { var f = off(n); return n.u + (f ? f.u : 0) }
    var nv = function (n) { var f = off(n); return n.v + (f ? f.v : 0) }

    // Floor edges, drawn before blocks so blocks sit on top of them.
    DATA.edges.forEach(function (e, k) {
      var dim = focus && e.from !== focus.id && e.to !== focus.id
      var pts = e.points.map(function (q) { return P(q[0], q[1]) })
      ctx.strokeStyle = dim ? 'rgba(110,106,216,0.12)' : 'rgba(126,122,230,0.5)'
      ctx.lineWidth = Math.max(1, Math.min(2.2, 0.6 + Math.log10(e.weight + 1) * 0.5)) * dpr
      ctx.setLineDash(e.back ? [4 * dpr, 4 * dpr] : [])
      ctx.beginPath()
      pts.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]) })
      ctx.stroke()
      ctx.setLineDash([])
      if (o.flow != null && !dim) {
        // A dot travelling from importer to imported, spaced per edge.
        var len = 0, seg = []
        for (var i = 1; i < pts.length; i++) { var l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); len += l }
        var at = ((o.flow * 60 * dpr + k * 37) % len), acc = 0
        for (var j = 0; j < seg.length; j++) {
          if (acc + seg[j] >= at) {
            var tt = (at - acc) / seg[j]
            var x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * tt, y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * tt
            ctx.fillStyle = '#c9c6ff'
            ctx.fillRect(x - 1.5 * dpr, y - 1.5 * dpr, 3 * dpr, 3 * dpr)
            break
          }
          acc += seg[j]
        }
      }
    })

    // Blocks.
    var labelled = []
    order.forEach(function (n) {
      var rise = o.rise ? Math.max(0, o.rise(n)) : 1
      var alpha = o.alpha ? o.alpha(n) : 1
      if (focus && n !== focus) alpha *= 0.4
      if (alpha <= 0.01) return
      var u = nu(n), v = nv(n), z = Math.max(0.05, n.h * rise)
      var col = (o.color && o.color(n)) || kindColor[n.kind] || '#6f7ba6'
      ctx.globalAlpha = alpha
      var A = P(u, v, z), Bq = P(u + n.w, v, z), Cq = P(u + n.w, v + n.d, z), D = P(u, v + n.d, z)
      var Bf = P(u + n.w, v, 0), Cf = P(u + n.w, v + n.d, 0), Df = P(u, v + n.d, 0)
      // Front-left face, front-right face, then top.
      poly(ctx, [D, Cq, Cf, Df]); ctx.fillStyle = shade(col, -0.08); ctx.fill()
      poly(ctx, [Cq, Bq, Bf, Cf]); ctx.fillStyle = shade(col, -0.32); ctx.fill()
      poly(ctx, [A, Bq, Cq, D]); ctx.fillStyle = shade(col, 0.14); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 1 * dpr
      ctx.stroke()
      if (n === focus) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5 * dpr
        poly(ctx, [A, Bq, Cq, D]); ctx.stroke()
      }
      ctx.globalAlpha = 1
      var showLabel = typeof o.labels === 'function' ? o.labels(n) : o.labels !== false
      if (showLabel && rise > 0.6 && alpha > 0.3) labelled.push({ n: n, at: A, alpha: alpha })
      var badge = o.badge && o.badge(n)
      if (badge) {
        var top = P(u + n.w / 2, v + n.d / 2, z)
        var r = 6 * dpr
        ctx.fillStyle = badge === 'ok' ? '#00e0b0' : '#e36262'
        ctx.fillRect(top[0] - r, top[1] - r * 2.6, r * 2, r * 2)
        ctx.fillStyle = BG
        ctx.font = '700 ' + Math.round(10 * dpr) + 'px "Geist Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(badge === 'ok' ? '✓' : '!', top[0], top[1] - r * 1.6)
        ctx.textAlign = 'left'
      }
    })

    // Focus: that zone's dependencies lifted into arcs, like a selection in
    // the real map.
    if (focus) {
      DATA.edges.forEach(function (e) {
        if (e.from !== focus.id && e.to !== focus.id) return
        var a = byId[e.from], b = byId[e.to]
        if (!a || !b) return
        var pa = P(nu(a) + a.w / 2, nv(a) + a.d / 2, a.h), pb = P(nu(b) + b.w / 2, nv(b) + b.d / 2, b.h)
        var mx = (pa[0] + pb[0]) / 2, my = Math.max(10 * dpr, Math.min(pa[1], pb[1]) - Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * 0.3)
        ctx.strokeStyle = '#9fd24a'
        ctx.lineWidth = 1.6 * dpr
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.quadraticCurveTo(mx, my, pb[0], pb[1]); ctx.stroke()
        var ang = Math.atan2(pb[1] - my, pb[0] - mx), ah = 6 * dpr
        ctx.fillStyle = '#9fd24a'
        ctx.beginPath(); ctx.moveTo(pb[0], pb[1]); ctx.lineTo(pb[0] - ah * Math.cos(ang - 0.45), pb[1] - ah * Math.sin(ang - 0.45)); ctx.lineTo(pb[0] - ah * Math.cos(ang + 0.45), pb[1] - ah * Math.sin(ang + 0.45)); ctx.fill()
      })
    }

    // Labels last so no block covers them: a small chip at the block's back
    // corner, as the real map does.
    var fs = Math.max(7, Math.round(Math.min(9.5, cam.s * 1.15))) * dpr
    ctx.font = '600 ' + fs + 'px "Geist Mono", monospace'
    ctx.textBaseline = 'middle'
    labelled.forEach(function (L) {
      var text = label(L.n.id)
      var tw = ctx.measureText(text).width
      var x = L.at[0] + 2 * dpr, y = L.at[1] - fs * 0.9
      ctx.globalAlpha = L.alpha
      ctx.fillStyle = 'rgba(18,18,43,0.88)'
      ctx.fillRect(x, y - fs * 0.75, tw + fs * 1.6, fs * 1.5)
      ctx.strokeStyle = 'rgba(120,118,200,0.5)'
      ctx.lineWidth = 1
      ctx.strokeRect(x, y - fs * 0.75, tw + fs * 1.6, fs * 1.5)
      ctx.fillStyle = kindColor[L.n.kind] || '#6f7ba6'
      ctx.fillRect(x + fs * 0.4, y - fs * 0.2, fs * 0.4, fs * 0.4)
      ctx.fillStyle = '#efeff7'
      ctx.fillText(text, x + fs * 1.1, y + 0.5)
      ctx.globalAlpha = 1
    })
  }

  window.NDXIso = { data: DATA, draw: draw, byId: byId, kindColor: kindColor, label: label, BG: BG }
})()
