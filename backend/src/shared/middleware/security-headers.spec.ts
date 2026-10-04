import { HSTS_HEADER, SECURITY_HEADERS } from './security-headers';

describe('security headers', () => {
  it('denies every content source, because this API serves no HTML', () => {
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("default-src 'none'");
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });

  it('stops a browser guessing that a JSON response is executable', () => {
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  it('sends no referrer, because a URL here can name an emergency', () => {
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('no-referrer');
  });

  it('keeps personal data out of caches', () => {
    expect(SECURITY_HEADERS['Cache-Control']).toBe('no-store');
  });

  it('denies the device capabilities nothing here needs', () => {
    expect(SECURITY_HEADERS['Permissions-Policy']).toContain('geolocation=()');
  });

  it('does not include HSTS among the always-on headers', () => {
    // Sending it in development would teach the browser to refuse plain HTTP on
    // localhost for two years, which is painful to undo. It is added in production only.
    expect(SECURITY_HEADERS).not.toHaveProperty('Strict-Transport-Security');
    expect(HSTS_HEADER).toContain('max-age=');
  });
});
