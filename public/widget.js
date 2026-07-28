;(function () {
  'use strict'

  function getWidgetScript() {
    var el = document.currentScript
    if (el && el.src) {
      return el
    }
    var nodes = document.getElementsByTagName('script')
    for (var i = nodes.length - 1; i >= 0; i--) {
      var s = nodes[i]
      var src = s.getAttribute('src') || ''
      if (/widget\.js(\?|#|$)/i.test(src)) {
        return s
      }
    }
    return null
  }

  // Pasting the snippet into both the theme header and a page builder is a
  // classic — mount once, not twice.
  if (window.__oceancoreWidgetMounted) {
    return
  }
  window.__oceancoreWidgetMounted = true

  var script = getWidgetScript()
  if (!script || !script.src) {
    return
  }

  var scriptUrl
  try {
    scriptUrl = new URL(script.src, window.location.href)
  } catch {
    return
  }

  var businessId = scriptUrl.searchParams.get('id')
  if (!businessId) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[OceanCore Widget] Add ?id=YOUR_BUSINESS_ID to the widget.js script URL.')
    }
    return
  }

  var baseOrigin = scriptUrl.origin
  var widgetSrc =
    baseOrigin + '/widget?embed=1&business_id=' + encodeURIComponent(businessId)

  var BTN = 56
  var GAP = 12
  var INSET = 24
  var IFRAME_W = 380
  var IFRAME_H = 560
  var NUDGE_DELAY = 10000
  /** Below this the chat takes the whole screen, the way a phone keyboard expects. */
  var COMPACT_MAX = 520
  var MESSAGE_SOURCE = 'oceancore-widget'

  var isOpen = false
  var iframeLoaded = false
  var hideTimer = null
  var nudgeVisible = false
  var nudgeTimer = null
  var nudgeSpent = false
  var scrollLocked = false
  var prevRootOverflow = ''
  var frameReady = false
  var revealTimer = null

  /**
   * Every declaration goes in as !important. Restaurant sites are full of blanket
   * rules like `button { background: #900 !important }`, and without the priority
   * the launcher inherits them — wrong colour, wrong font, sometimes wrong shape.
   */
  function css(el, styles) {
    for (var prop in styles) {
      if (!Object.prototype.hasOwnProperty.call(styles, prop)) continue
      var value = styles[prop]
      if (value === null) {
        el.style.removeProperty(prop)
      } else {
        el.style.setProperty(prop, String(value), 'important')
      }
    }
  }

  var prefersReducedMotion = false
  try {
    prefersReducedMotion =
      !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch {
    prefersReducedMotion = false
  }

  // ── Frame ───────────────────────────────────────────────────────────────────

  var iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'OceanCore concierge chat')
  iframe.setAttribute('frameborder', '0')
  css(iframe, {
    'box-sizing': 'border-box',
    position: 'fixed',
    'z-index': '2147483646',
    border: 'none',
    background: '#fff',
    display: 'none',
    opacity: '0',
    transition: 'opacity 0.2s ease-out',
  })

  // ── Launcher ────────────────────────────────────────────────────────────────

  var button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', 'Open chat')
  button.setAttribute('aria-expanded', 'false')
  css(button, {
    'box-sizing': 'border-box',
    position: 'fixed',
    width: BTN + 'px',
    height: BTN + 'px',
    'min-width': BTN + 'px',
    'min-height': BTN + 'px',
    'max-width': BTN + 'px',
    'max-height': BTN + 'px',
    right: INSET + 'px',
    bottom: INSET + 'px',
    float: 'none',
    'z-index': '2147483647',
    margin: '0',
    padding: '0',
    border: 'none',
    outline: 'none',
    'border-radius': '50%',
    cursor: 'pointer',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    // Themes love blanket `button` rules — size, case and animation included.
    appearance: 'none',
    '-webkit-appearance': 'none',
    font: '400 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    'text-transform': 'none',
    'letter-spacing': 'normal',
    'text-decoration': 'none',
    animation: 'none',
    filter: 'none',
    visibility: 'visible',
    background: 'linear-gradient(140deg, #38bdf8 0%, #0ea5e9 100%)',
    'box-shadow': '0 8px 24px rgba(14, 165, 233, 0.45), 0 4px 12px rgba(2, 132, 199, 0.35)',
    color: '#ffffff',
    opacity: prefersReducedMotion ? '1' : '0',
    transform: prefersReducedMotion ? 'none' : 'translateY(24px) scale(0.86)',
    transition: prefersReducedMotion
      ? 'box-shadow 0.15s ease'
      : 'opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.15s ease',
  })

  var CHAT_PATH =
    'M21 11.5c0 4.14-4.03 7.5-9 7.5-1.06 0-2.08-.15-3.02-.43L4 20l1.18-3.55C4.05 15.13 3 13.42 3 11.5 3 7.36 7.03 4 12 4s9 3.36 9 7.5Z'
  var CLOSE_PATH = 'M6 6l12 12M18 6L6 18'

  var svgNs = 'http://www.w3.org/2000/svg'
  var svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('width', '26')
  svg.setAttribute('height', '26')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  css(svg, { display: 'block', 'flex-shrink': '0' })
  var path = document.createElementNS(svgNs, 'path')
  path.setAttribute('d', CHAT_PATH)
  path.setAttribute('fill', '#04121f')
  path.setAttribute('stroke', 'none')
  svg.appendChild(path)
  var dots = []
  ;[8.6, 12, 15.4].forEach(function (cx) {
    var dot = document.createElementNS(svgNs, 'circle')
    dot.setAttribute('cx', String(cx))
    dot.setAttribute('cy', '11.5')
    dot.setAttribute('r', '1.15')
    dot.setAttribute('fill', '#38bdf8')
    svg.appendChild(dot)
    dots.push(dot)
  })
  button.appendChild(svg)

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
    if (!m) return null
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
    }
  }

  function mixHex(hex, towardWhite, amount) {
    var rgb = hexToRgb(hex)
    if (!rgb) return hex
    var t = towardWhite ? 255 : 0
    function mix(c) {
      return Math.round(c + (t - c) * amount)
        .toString(16)
        .padStart(2, '0')
    }
    return '#' + mix(rgb.r) + mix(rgb.g) + mix(rgb.b)
  }

  function luminance(hex) {
    var rgb = hexToRgb(hex)
    if (!rgb) return 0.5
    function lin(c) {
      var s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
  }

  function applyLauncherColor(hex) {
    if (!hex || !hexToRgb(hex)) return
    var light = mixHex(hex, true, 0.28)
    var rgb = hexToRgb(hex)
    var lum = luminance(hex)
    css(button, {
      background: 'linear-gradient(140deg, ' + light + ' 0%, ' + hex + ' 100%)',
      color: lum > 0.55 ? '#0f172a' : '#ffffff',
      // A pale brand colour glowing in its own hue is invisible on a white
      // page — such a launcher gets a hairline and a neutral shadow instead.
      'box-shadow':
        lum > 0.6
          ? '0 0 0 1px rgba(15, 23, 42, 0.14), 0 10px 26px rgba(15, 23, 42, 0.2)'
          : '0 8px 24px rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.45), 0 4px 12px rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.3)',
    })
    dots.forEach(function (dot) {
      dot.setAttribute('fill', hex)
    })
  }

  // ── Proactive nudge ─────────────────────────────────────────────────────────

  var nudge = document.createElement('div')
  css(nudge, {
    'box-sizing': 'border-box',
    position: 'fixed',
    right: INSET + 'px',
    bottom: INSET + BTN + GAP + 'px',
    'z-index': '2147483646',
    'max-width': '244px',
    margin: '0',
    padding: '11px 32px 11px 14px',
    'border-radius': '16px',
    background: '#ffffff',
    color: '#0f172a',
    border: '1px solid rgba(15,23,42,0.08)',
    'box-shadow': '0 12px 30px rgba(15,23,42,0.18)',
    font: '500 13.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    'text-align': 'left',
    cursor: 'pointer',
    display: 'none',
    opacity: '0',
    transform: prefersReducedMotion ? 'none' : 'translateY(8px)',
    transition: prefersReducedMotion
      ? 'opacity 0.2s ease-out'
      : 'opacity 0.25s ease-out, transform 0.25s ease-out',
  })

  var nudgeText = document.createElement('span')
  nudgeText.textContent = 'Hi! Can I help you book a table or answer a question?'
  css(nudgeText, { font: 'inherit', color: 'inherit' })
  nudge.appendChild(nudgeText)

  var tail = document.createElement('span')
  css(tail, {
    position: 'absolute',
    right: '22px',
    bottom: '-5px',
    width: '12px',
    height: '12px',
    background: '#ffffff',
    'border-right': '1px solid rgba(15,23,42,0.08)',
    'border-bottom': '1px solid rgba(15,23,42,0.08)',
    transform: 'rotate(45deg)',
  })
  nudge.appendChild(tail)

  var nudgeClose = document.createElement('button')
  nudgeClose.type = 'button'
  nudgeClose.setAttribute('aria-label', 'Dismiss')
  nudgeClose.textContent = '×'
  css(nudgeClose, {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '20px',
    height: '20px',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    margin: '0',
    padding: '0',
    border: 'none',
    'border-radius': '50%',
    background: 'transparent',
    color: '#64748b',
    font: '400 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    cursor: 'pointer',
  })
  nudge.appendChild(nudgeClose)

  function showNudge() {
    if (isOpen || nudgeVisible || nudgeSpent) {
      return
    }
    nudgeVisible = true
    css(nudge, { display: 'block' })
    window.requestAnimationFrame(function () {
      css(nudge, { opacity: '1', transform: 'none' })
    })
  }

  function hideNudge() {
    if (nudgeTimer) {
      window.clearTimeout(nudgeTimer)
      nudgeTimer = null
    }
    nudgeSpent = true
    if (!nudgeVisible) {
      css(nudge, { display: 'none' })
      return
    }
    nudgeVisible = false
    css(nudge, {
      opacity: '0',
      transform: prefersReducedMotion ? 'none' : 'translateY(8px)',
    })
    window.setTimeout(function () {
      if (!nudgeVisible) {
        css(nudge, { display: 'none' })
      }
    }, 250)
  }

  nudge.addEventListener('click', function () {
    setOpen(true)
  })
  nudgeClose.addEventListener('click', function (e) {
    e.stopPropagation()
    hideNudge()
  })

  // ── Open / close ────────────────────────────────────────────────────────────

  function isCompact() {
    return window.innerWidth <= COMPACT_MAX
  }

  /**
   * Docked card on a desktop page, full screen on a phone — where a 380px card
   * pinned above a floating button leaves no room for the keyboard.
   */
  function applyFrameLayout() {
    var fullscreen = isOpen && isCompact()
    if (fullscreen) {
      css(iframe, {
        top: '0px',
        left: '0px',
        right: '0px',
        bottom: '0px',
        width: '100%',
        height: '100%',
        'max-width': 'none',
        'max-height': 'none',
        'border-radius': '0',
        'box-shadow': 'none',
      })
      css(button, { display: 'none' })
    } else {
      css(iframe, {
        top: 'auto',
        left: 'auto',
        right: INSET + 'px',
        bottom: INSET + BTN + GAP + 'px',
        width: IFRAME_W + 'px',
        height: IFRAME_H + 'px',
        'max-width': 'calc(100vw - ' + INSET * 2 + 'px)',
        'max-height': 'calc(100vh - ' + (INSET + BTN + GAP + 40) + 'px)',
        'border-radius': '16px',
        'box-shadow': '0 12px 40px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(0,0,0,0.06)',
      })
      css(button, { display: 'flex' })
    }
    lockScroll(fullscreen)
  }

  /** Keep the host page from scrolling behind a full-screen chat. */
  function lockScroll(lock) {
    var root = document.documentElement
    if (!root) return
    if (lock && !scrollLocked) {
      prevRootOverflow = root.style.getPropertyValue('overflow')
      root.style.setProperty('overflow', 'hidden', 'important')
      scrollLocked = true
    } else if (!lock && scrollLocked) {
      root.style.removeProperty('overflow')
      if (prevRootOverflow) root.style.setProperty('overflow', prevRootOverflow)
      scrollLocked = false
    }
  }

  function revealFrame() {
    if (revealTimer) {
      window.clearTimeout(revealTimer)
      revealTimer = null
    }
    if (isOpen) css(iframe, { opacity: '1' })
  }

  function setOpen(open) {
    if (hideTimer) {
      window.clearTimeout(hideTimer)
      hideTimer = null
    }
    isOpen = open
    button.setAttribute('aria-expanded', open ? 'true' : 'false')
    button.setAttribute('aria-label', open ? 'Close chat' : 'Open chat')
    // Swap the icon: chat bubble when closed, X when open.
    path.setAttribute('d', open ? CLOSE_PATH : CHAT_PATH)
    path.setAttribute('fill', open ? 'none' : '#04121f')
    path.setAttribute('stroke', open ? 'currentColor' : 'none')
    path.setAttribute('stroke-width', open ? '2.25' : '0')
    path.setAttribute('stroke-linecap', 'round')
    dots.forEach(function (dot) {
      dot.style.setProperty('display', open ? 'none' : 'block', 'important')
    })
    if (open) {
      hideNudge()
      if (!iframeLoaded) {
        iframe.src = widgetSrc
        iframeLoaded = true
      }
      css(iframe, { display: 'block' })
      applyFrameLayout()
      // Hold the fade until the chat says it is up, so the first open never
      // flashes an empty white card. Reveal anyway if that word never comes.
      if (frameReady) {
        window.requestAnimationFrame(revealFrame)
      } else if (!revealTimer) {
        revealTimer = window.setTimeout(revealFrame, 1500)
      }
      // Typing should land in the chat, not behind it.
      window.setTimeout(function () {
        if (isOpen && iframe.contentWindow) iframe.focus()
      }, 220)
    } else {
      applyFrameLayout()
      css(iframe, { opacity: '0' })
      hideTimer = window.setTimeout(function () {
        hideTimer = null
        if (!isOpen) {
          css(iframe, { display: 'none' })
        }
      }, 200)
    }
  }

  button.addEventListener('click', function () {
    setOpen(!isOpen)
  })

  button.addEventListener('mouseenter', function () {
    if (!isOpen) css(button, { transform: 'scale(1.05)' })
  })
  button.addEventListener('mouseleave', function () {
    css(button, { transform: 'scale(1)' })
  })

  // The panel's own × (and Escape inside the frame) reach us as a message.
  window.addEventListener('message', function (event) {
    if (event.origin !== baseOrigin) return
    if (!iframe.contentWindow || event.source !== iframe.contentWindow) return
    var data = event.data
    if (!data || data.source !== MESSAGE_SOURCE) return
    if (data.type === 'ready') {
      frameReady = true
      revealFrame()
    } else if (data.type === 'close') {
      setOpen(false)
    }
  })

  // Escape while the host page still holds focus.
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen) setOpen(false)
  })

  window.addEventListener('resize', function () {
    if (isOpen) applyFrameLayout()
  })

  // ── Mount ───────────────────────────────────────────────────────────────────

  function mount() {
    applyFrameLayout()
    document.body.appendChild(iframe)
    document.body.appendChild(button)
    document.body.appendChild(nudge)
    window.requestAnimationFrame(function () {
      css(button, { opacity: '1', transform: 'none' })
    })
    armNudge()
  }

  function armNudge() {
    if (nudgeSpent) {
      return
    }
    nudgeTimer = window.setTimeout(showNudge, NUDGE_DELAY)
    // Personalize the copy + tint the FAB to the restaurant brand when available.
    try {
      fetch(baseOrigin + '/api/widget/meta?id=' + encodeURIComponent(businessId))
        .then(function (res) {
          return res && res.ok ? res.json() : null
        })
        .then(function (meta) {
          if (!meta) {
            return
          }
          if (meta.agentName) {
            nudgeText.textContent = "Hi! I'm " + meta.agentName + ' — can I help you book a table?'
          } else if (meta.name) {
            nudgeText.textContent = 'Hi! Can I help you book a table at ' + meta.name + '?'
          }
          if (meta.launcherColor) {
            applyLauncherColor(meta.launcherColor)
          }
        })
        .catch(function () {
          /* offline / blocked — keep the default copy */
        })
    } catch {
      /* fetch unavailable — keep the default copy */
    }
  }

  if (document.body) {
    mount()
  } else {
    document.addEventListener('DOMContentLoaded', mount)
  }
})()
