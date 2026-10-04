/**
 * Response headers set on every reply.
 *
 * Written out rather than pulled from a package, for two reasons. This is a JSON API
 * with no HTML surface of its own, so most of what a general-purpose middleware sets
 * would be inert here, and every header that is set can be justified individually in
 * the security review rather than attributed to a library's defaults.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  // There is no HTML and no script, so everything is denied. A response that somehow
  // rendered would be unable to load or execute anything at all.
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",

  // Stops a browser guessing that a JSON response is something executable.
  'X-Content-Type-Options': 'nosniff',

  // No API response belongs in a frame, and the CSP above says so to modern browsers.
  // This repeats it for older ones.
  'X-Frame-Options': 'DENY',

  // A URL here can carry an emergency's id, which should not travel to another origin
  // in a Referer header.
  'Referrer-Policy': 'no-referrer',

  // Nothing here needs a device capability. Denying them means an embedded response
  // cannot ask on this origin's behalf.
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',

  // Personal data, so it should not sit in a shared cache or a browser's disk.
  'Cache-Control': 'no-store',
};

/**
 * HTTP Strict Transport Security, set only in production.
 *
 * Sending it in development would teach the browser to refuse plain HTTP on localhost
 * for the next two years, which is a painful thing to undo on a machine.
 */
export const HSTS_HEADER = 'max-age=63072000; includeSubDomains';
