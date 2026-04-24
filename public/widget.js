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
  } catch (e) {
    return
  }

  var businessId = scriptUrl.searchParams.get('id')
  if (!businessId) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Salon AI Widget] Add ?id=YOUR_BUSINESS_ID to the widget.js script URL.')
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

  var isOpen = false
  var iframeLoaded = false
  var hideTimer = null

  var iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Salon AI chat')
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
  button.style.background = 'linear-gradient(135deg, #7c3aed 0%, #dc2626 100%)'
  button.style.boxShadow = '0 8px 24px rgba(124, 58, 237, 0.45), 0 4px 12px rgba(220, 38, 38, 0.35)'
  button.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease'

  var svgNs = 'http://www.w3.org/2000/svg'
  var svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('width', '28')
  svg.setAttribute('height', '28')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  var path = document.createElementNS(svgNs, 'path')
  path.setAttribute(
    'd',
    'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z'
  )
  path.setAttribute('stroke', '#ffffff')
  path.setAttribute('stroke-width', '1.75')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('fill', 'rgba(255,255,255,0.15)')
  svg.appendChild(path)
  button.appendChild(svg)

  function setOpen(open) {
    if (hideTimer) {
      window.clearTimeout(hideTimer)
      hideTimer = null
    }
    isOpen = open
    button.setAttribute('aria-expanded', open ? 'true' : 'false')
    button.setAttribute('aria-label', open ? 'Close chat' : 'Open chat')
    if (open) {
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
    button.style.transform = 'scale(1.05)'
    button.style.boxShadow = '0 10px 28px rgba(124, 58, 237, 0.5), 0 6px 16px rgba(220, 38, 38, 0.4)'
  })
  button.addEventListener('mouseleave', function () {
    button.style.transform = 'scale(1)'
    button.style.boxShadow = '0 8px 24px rgba(124, 58, 237, 0.45), 0 4px 12px rgba(220, 38, 38, 0.35)'
  })

  function mount() {
    document.body.appendChild(iframe)
    document.body.appendChild(button)
  }
  if (document.body) {
    mount()
  } else {
    document.addEventListener('DOMContentLoaded', mount)
  }
})()
