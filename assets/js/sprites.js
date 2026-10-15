// 8-bit sprite sheet for n-dx.dev. Each sprite is rows of palette characters;
// "." is transparent. Rendered by pixel.js — never as images, so they stay
// crisp at any scale and can be recoloured per page.
;(function (root) {
  var PALETTE = {
    k: '#16151c', // ink
    p: '#6a3df0', // n-dx purple
    d: '#4522b8', // purple shade
    l: '#b9a7ff', // lavender
    w: '#ffffff',
    t: '#00e0b0', // en-dash teal
    e: '#00a883', // teal shade
    g: '#8e8c96', // grey
    s: '#d6d4dc', // silver
    o: '#ff4d1f', // signal
    r: '#b8300c', // signal shade
    a: '#ffb020', // amber
    y: '#ffe08a', // light amber
    b: '#2a2733', // crt
  }

  // Rex, facing right — traced from the Rex-F mascot art. Teal belly and
  // teeth, eye on row 2. Notches are filled with shade rather than left
  // transparent so the card behind never shows through.
  var REX_BODY = [
    '.......ppppp....',
    '.....ppppppppppp',
    '.....pppwbpppppp',
    '....pppppppppppp',
    '....ppptptpppppp',
    '....ppttttttttt.',
    '.....ppttttttt..',
    '.....ppptpptppp.',
    '....pppptttpppp.',
    'ppppppppptttpp..',
    'ppppppppptttp...',
    'pppppppddtttp...',
    '.ppppppdtttdp...',
  ]
  // Four-frame walk cycle. Each frame is [thigh, shin, feet]. A lifted foot is
  // drawn on the shin row, one pixel up, so the leg reads as swinging rather
  // than sliding. The back leg (left) and front leg (right) alternate:
  //   0 both planted, spread      1 front lifted, back under the body
  //   2 both planted, closer      3 back lifted, front under the body
  var LEGS = {
    stand: ['..ppppptttppp...', '..ppppptttppp...', '....pppt.ppttt..'],
    walk0: ['..ppppptttppp...', '..ppppptttppp...', '...pppt...ppttt.'],
    walk1: ['..ppppptttppp...', '..ppppptttppttt.', '.....pppt.......'],
    walk2: ['..ppppptttppp...', '..ppppptttppp...', '....pppt.ppttt..'],
    walk3: ['..ppppptttppp...', 'pppt.pptttppp...', '.........ppttt..'],
    jump:  ['..ppppptttppp...', '...pppt..ppttt..', '................'],
  }
  function rex(legs, blink) {
    var body = REX_BODY.slice()
    if (blink) body[2] = '.....pppddpppppp'
    return body.concat(LEGS[legs])
  }

  var SPRITES = {
    rex_idle0: rex('stand', false),
    rex_idle1: rex('stand', true),
    rex_walk0: rex('walk0', false),
    rex_walk1: rex('walk1', false),
    rex_walk2: rex('walk2', false),
    rex_walk3: rex('walk3', false),
    rex_jump: rex('jump', false),

    // sourcevision — the scanning eye
    eye: [
      '................',
      '.....kkkkkk.....',
      '...kkwwwwwwkk...',
      '..kwwwwkkwwwwk..',
      '.kwwwwkttkwwwwk.',
      'kwwwwkttttkwwwwk',
      'kwwwkttkkttkwwwk',
      'kwwwkttkkttkwwwk',
      'kwwwwkttttkwwwwk',
      '.kwwwwkttkwwwwk.',
      '..kwwwwkkwwwwk..',
      '...kkwwwwwwkk...',
      '.....kkkkkk.....',
      '................',
      '..t..t..t..t..t.',
      '................',
    ],
    // rex — the plan
    clip: [
      '.....kkkkkk.....',
      '..kkkkgssgkkkk..',
      '..kaakkkkkkaak..',
      '..kawwwwwwwwak..',
      '..kawtwkkkkwak..',
      '..kawwwwwwwwak..',
      '..kawtwkkkwwak..',
      '..kawwwwwwwwak..',
      '..kawowkkkkwak..',
      '..kawwwwwwwwak..',
      '..kawtwkkwwwak..',
      '..kawwwwwwwwak..',
      '..kawwwwwwwwak..',
      '..kaaaaaaaaaak..',
      '..kkkkkkkkkkkk..',
      '................',
    ],
    // hench — the wrench
    wrench: [
      '..........kkk...',
      '.........kssk...',
      '........kssk..k.',
      '........kssk.ksk',
      '........ksskkssk',
      '.......kssssssk.',
      '......kssssssk..',
      '.....ksssgkkk...',
      '....ksssgk......',
      '...ksssgk.......',
      '..ksssgk........',
      '.kttsgk.........',
      'kttttk..........',
      'kettk...........',
      '.kkk............',
      '................',
    ],
    bug: [
      '..k......k..',
      '...k....k...',
      '....kkkk....',
      '..kkoooookk.',
      '.kkoowwookkk',
      'k.koooooook.k',
      '..korrrrrok.',
      'k.korrrrrok.k',
      '..kkorrrokk.',
      '.k..kkkkk..k',
    ],
    check: [
      '.......k',
      '......kt',
      'k....kt.',
      'tk..kt..',
      '.tkkt...',
      '..tt....',
    ],
    coin: [
      '..kkkk..',
      '.kayyak.',
      'kayaayak',
      'kayaayak',
      'kayaayak',
      'kayaayak',
      '.kaaaak.',
      '..kkkk..',
    ],
    heart: [
      '.kkk.kkk.',
      'koookoook',
      'kowoooook',
      'koooooook',
      '.koooook.',
      '..koook..',
      '...kok...',
      '....k....',
    ],
    flag: [
      'kkkkkkk.',
      'ktttttk.',
      'ktkktk..',
      'ktttttk.',
      'kkkkkkk.',
      'k.......',
      'k.......',
      'k.......',
      'k.......',
      'kk......',
    ],
    folder: [
      '.kkkk.......',
      'kaaaak......',
      'kaaaaakkkkkk',
      'kyyyyyyyyyyk',
      'kaaaaaaaaaak',
      'kaaaaaaaaaak',
      'kaaaaaaaaaak',
      'kkkkkkkkkkkk',
    ],
    file: [
      'kkkkkk..',
      'kwwwwkk.',
      'kwwwwkwk',
      'kwggwwwk',
      'kwwwwwwk',
      'kwggggwk',
      'kwwwwwwk',
      'kkkkkkkk',
    ],
    star: [
      '....k....',
      '...kak...',
      'kkkkakkkk',
      'kayyaayak',
      '.kaaaaak.',
      '..kaaak..',
      '.kak.kak.',
      'kk.....kk',
    ],
    lock: [
      '..kkkk..',
      '.k....k.',
      '.k....k.',
      'kkkkkkkk',
      'kaaaaaak',
      'kaakkaak',
      'kaaakaak',
      'kkkkkkkk',
    ],
    // Theme toggle icons.
    sun: [
      '....a....',
      '.a..a..a.',
      '..aaaaa..',
      '..ayyya..',
      'aaayyyaaa',
      '..ayyya..',
      '..aaaaa..',
      '.a..a..a.',
      '....a....',
    ],
    moon: [
      '...ppp...',
      '..pppp...',
      '.ppp.....',
      '.pp......',
      '.pp......',
      '.ppp.....',
      '..ppppp..',
      '...pppp..',
      '.........',
    ],
    ghost: [
      '...kkkk...',
      '..kssssk..',
      '.kssssssk.',
      'kswksswksk',
      'kskksskksk',
      'kssssssssk',
      'kssssssssk',
      'kssssssssk',
      'kskssssksk',
      'kk.kkkk.kk',
    ],
  }

  // Normalise ragged rows so every sprite is a clean rectangle.
  for (var name in SPRITES) {
    var rows = SPRITES[name].map(function (r) { return r.replace(/ /g, '.') })
    var w = rows.reduce(function (m, r) { return Math.max(m, r.length) }, 0)
    SPRITES[name] = rows.map(function (r) { while (r.length < w) r += '.'; return r })
  }

  // Walk-cycle frame for a phase counter (any monotonically increasing integer).
  var REX_WALK = ['rex_walk0', 'rex_walk1', 'rex_walk2', 'rex_walk3']
  function rexWalk(n) { return REX_WALK[((n % 4) + 4) % 4] }

  var api = { PALETTE: PALETTE, SPRITES: SPRITES, REX_WALK: REX_WALK, rexWalk: rexWalk }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.NDX_SPRITES = api
})(typeof window !== 'undefined' ? window : this)
