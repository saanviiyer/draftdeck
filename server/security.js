import { timingSafeEqual } from 'node:crypto'

export function secureEqual(a, b) {
  const left = Buffer.from(a || '')
  const right = Buffer.from(b || '')
  return left.length === right.length && timingSafeEqual(left, right)
}

export function securityHeaders(_req, res, next) {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  })
  next()
}

export function rateLimit(windowMs, max) {
  const clients = new Map()
  return (req, res, next) => {
    const now = Date.now()
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const previous = clients.get(key)
    const current = !previous || now - previous.startedAt >= windowMs ? { startedAt: now, count: 1 } : { ...previous, count: previous.count + 1 }
    clients.set(key, current)
    res.set('RateLimit-Limit', String(max))
    res.set('RateLimit-Remaining', String(Math.max(0, max - current.count)))
    if (current.count > max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - current.startedAt)) / 1000)))
      return res.status(429).json({ error: 'Too many requests. Please try again later.' })
    }
    next()
  }
}
