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
  var widgetSrc = baseOrigin + '/widget?business_id=' + encodeURIComponent(businessId)

  var BTN = 56
  var GAP = 12
  var INSET = 24
  var IFRAME_W = 380
  var IFRAME_H = 500
  var NUDGE_DELAY = 10000

  var isOpen = false
  var iframeLoaded = false
  var hideTimer = null
  var nudgeVisible = false
  var nudgeTimer = null
  var nudgeSpent = false

  var iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'OceanCore concierge chat')
  iframe.setAttribute('frameborder', '0')
  iframe.style.boxSizing = 'border-box'
  iframe.style.position = 'fixed'
  iframe.style.width = IFRAME_W + 'px'
  iframe.style.height = IFRAME_H + 'px'
  iframe.style.maxWidth = 'calc(100vw - ' + INSET * 2 + 'px)'
  iframe.style.maxHeight = 'calc(100vh - ' + (INSET + BTN + GAP + 40) + 'px)'
  iframe.style.right = INSET + 'px'
  iframe.style.bottom = INSET + BTN + GAP + 'px'
  iframe.style.zIndex = '2147483646'
  iframe.style.border = 'none'
  iframe.style.borderRadius = '16px'
  iframe.style.boxShadow = '0 12px 40px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(0,0,0,0.06)'
  iframe.style.background = '#fff'
  iframe.style.display = 'none'
  iframe.style.opacity = '0'
  iframe.style.transition = 'opacity 0.2s ease-out'

  var prefersReducedMotion = false
  try {
    prefersReducedMotion =
      !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch {
    prefersReducedMotion = false
  }

  var button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', 'Open chat')
  button.setAttribute('aria-expanded', 'false')
  button.style.boxSizing = 'border-box'
  button.style.position = 'fixed'
  button.style.width = BTN + 'px'
  button.style.height = BTN + 'px'
  button.style.right = INSET + 'px'
  button.style.bottom = INSET + 'px'
  button.style.zIndex = '2147483647'
  button.style.border = 'none'
  button.style.borderRadius = '50%'
  button.style.cursor = 'pointer'
  button.style.padding = '0'
  button.style.display = 'flex'
  button.style.alignItems = 'center'
  button.style.justifyContent = 'center'
  button.style.background = 'linear-gradient(140deg, #38bdf8 0%, #0ea5e9 100%)'
  button.style.boxShadow = '0 8px 24px rgba(14, 165, 233, 0.45), 0 4px 12px rgba(2, 132, 199, 0.35)'
  button.style.color = '#ffffff'
  button.style.opacity = prefersReducedMotion ? '1' : '0'
  button.style.transform = prefersReducedMotion ? 'none' : 'translateY(24px) scale(0.86)'
  button.style.transition = prefersReducedMotion
    ? 'box-shadow 0.15s ease'
    : 'opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.15s ease'

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
    button.style.background = 'linear-gradient(140deg, ' + light + ' 0%, ' + hex + ' 100%)'
    button.style.color = luminance(hex) > 0.55 ? '#0f172a' : '#ffffff'
    button.style.boxShadow =
      '0 8px 24px rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.45), 0 4px 12px rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.3)'
    dots.forEach(function (dot) {
      dot.setAttribute('fill', hex)
    })
  }

  var nudge = document.createElement('div')
  nudge.style.boxSizing = 'border-box'
  nudge.style.position = 'fixed'
  nudge.style.right = INSET + 'px'
  nudge.style.bottom = INSET + BTN + GAP + 'px'
  nudge.style.zIndex = '2147483646'
  nudge.style.maxWidth = '244px'
  nudge.style.padding = '11px 32px 11px 14px'
  nudge.style.borderRadius = '16px'
  nudge.style.background = '#ffffff'
  nudge.style.color = '#0f172a'
  nudge.style.border = '1px solid rgba(15,23,42,0.08)'
  nudge.style.boxShadow = '0 12px 30px rgba(15,23,42,0.18)'
  nudge.style.font = '500 13.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  nudge.style.cursor = 'pointer'
  nudge.style.display = 'none'
  nudge.style.opacity = '0'
  nudge.style.transform = prefersReducedMotion ? 'none' : 'translateY(8px)'
  nudge.style.transition = prefersReducedMotion
    ? 'opacity 0.2s ease-out'
    : 'opacity 0.25s ease-out, transform 0.25s ease-out'

  var nudgeText = document.createElement('span')
  nudgeText.textContent = 'Hi! Can I help you book a table or answer a question?'
  nudge.appendChild(nudgeText)

  var tail = document.createElement('span')
  tail.style.position = 'absolute'
  tail.style.right = '22px'
  tail.style.bottom = '-5px'
  tail.style.width = '12px'
  tail.style.height = '12px'
  tail.style.background = '#ffffff'
  tail.style.borderRight = '1px solid rgba(15,23,42,0.08)'
  tail.style.borderBottom = '1px solid rgba(15,23,42,0.08)'
  tail.style.transform = 'rotate(45deg)'
  nudge.appendChild(tail)

  var nudgeClose = document.createElement('button')
  nudgeClose.type = 'button'
  nudgeClose.setAttribute('aria-label', 'Dismiss')
  nudgeClose.textContent = '\u00d7'
  nudgeClose.style.position = 'absolute'
  nudgeClose.style.top = '6px'
  nudgeClose.style.right = '6px'
  nudgeClose.style.width = '20px'
  nudgeClose.style.height = '20px'
  nudgeClose.style.display = 'flex'
  nudgeClose.style.alignItems = 'center'
  nudgeClose.style.justifyContent = 'center'
  nudgeClose.style.padding = '0'
  nudgeClose.style.border = 'none'
  nudgeClose.style.borderRadius = '50%'
  nudgeClose.style.background = 'transparent'
  nudgeClose.style.color = '#64748b'
  nudgeClose.style.fontSize = '16px'
  nudgeClose.style.lineHeight = '1'
  nudgeClose.style.cursor = 'pointer'
  nudge.appendChild(nudgeClose)

  function showNudge() {
    if (isOpen || nudgeVisible || nudgeSpent) {
      return
    }
    nudgeVisible = true
    nudge.style.display = 'block'
    window.requestAnimationFrame(function () {
      nudge.style.opacity = '1'
      nudge.style.transform = 'none'
    })
  }

  function hideNudge() {
    if (nudgeTimer) {
      window.clearTimeout(nudgeTimer)
      nudgeTimer = null
    }
    nudgeSpent = true
    if (!nudgeVisible) {
      nudge.style.display = 'none'
      return
    }
    nudgeVisible = false
    nudge.style.opacity = '0'
    nudge.style.transform = prefersReducedMotion ? 'none' : 'translateY(8px)'
    window.setTimeout(function () {
      if (!nudgeVisible) {
        nudge.style.display = 'none'
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
      dot.style.display = open ? 'none' : 'block'
    })
    if (open) {
      hideNudge()
      if (!iframeLoaded) {
        iframe.src = widgetSrc
        iframeLoaded = true
      }
      iframe.style.display = 'block'
      window.requestAnimationFrame(function () {
        iframe.style.opacity = '1'
      })
    } else {
      iframe.style.opacity = '0'
      hideTimer = window.setTimeout(function () {
        hideTimer = null
        if (!isOpen) {
          iframe.style.display = 'none'
        }
      }, 200)
    }
  }

  button.addEventListener('click', function () {
    setOpen(!isOpen)
  })

  button.addEventListener('mouseenter', function () {
    if (!isOpen) button.style.transform = 'scale(1.05)'
  })
  button.addEventListener('mouseleave', function () {
    button.style.transform = 'scale(1)'
  })

  function mount() {
    document.body.appendChild(iframe)
    document.body.appendChild(button)
    document.body.appendChild(nudge)
    window.requestAnimationFrame(function () {
      button.style.opacity = '1'
      button.style.transform = 'none'
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
            nudgeText.textContent = "Hi! I'm " + meta.agentName + ' \u2014 can I help you book a table?'
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
