const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const hpp = require('hpp');
const { tooManyRequests } = require('../utils/apiResponse');

/**
 * Rate limiter — general API
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooManyRequests(res, 'Too many requests. Please try again after 15 minutes.'),
});

/**
 * Rate limiter — auth endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  handler: (req, res) => tooManyRequests(res, 'Too many login attempts. Please try again after 15 minutes.'),
});

/**
 * Rate limiter — LOGIN brute-force defense (strict).
 * Window: exactly 15 minutes. Threshold: max 5 attempts per IP.
 * On breach, rejects with HTTP 429 BEFORE the request reaches the controller
 * (and therefore before any database lookup), using the exact JSON contract
 * expected by the client: { status: false, message: "..." }.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    status: false,
    message: 'Too many login attempts from this device. Please try again after 15 minutes.',
  }),
});

/**
 * Rate limiter — OTP endpoints
 */
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  handler: (req, res) => tooManyRequests(res, 'Too many OTP requests. Please wait 10 minutes.'),
});

/**
 * Rate limiter — transfer endpoints
 */
const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  handler: (req, res) => tooManyRequests(res, 'Too many transfer attempts. Please wait 1 minute.'),
});

/**
 * Helmet security headers
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      // Allow the Cloudflare Turnstile widget script.
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
      // Turnstile renders its challenge inside an iframe from this origin.
      frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * Request sanitization middleware
 */
const sanitizeRequest = (req, res, next) => {
  // Strip MongoDB-like operators from query params (protection layer)
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    for (const key in obj) {
      if (key.startsWith('$') || key.startsWith('{')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      } else if (typeof obj[key] === 'string') {
        // Basic XSS stripping
        obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    }
    return obj;
  };
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  next();
};

/**
 * Add security-related response headers
 */
const securityResponseHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  next();
};

module.exports = {
  apiLimiter,
  authLimiter,
  loginLimiter,
  otpLimiter,
  transferLimiter,
  securityHeaders,
  sanitizeRequest,
  securityResponseHeaders,
  hpp,
};
