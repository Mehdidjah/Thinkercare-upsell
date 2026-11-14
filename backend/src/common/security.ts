import type { NextFunction, Request, Response } from 'express';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  next();
}

/** Path part of a request URL, without URL parsing; leading slashes/backslashes collapse to one so it can never be scheme-relative. */
export function requestPath(originalUrl: string): string {
  const q = originalUrl.indexOf('?');
  const path = q === -1 ? originalUrl : originalUrl.slice(0, q);
  return path.replace(/^[/\\]+/, '/');
}

export function stripTrailingSlash(req: Request, res: Response, next: NextFunction): void {
  // Only origin-form targets ("/path"); an absolute-form target ("http://host/path/") would
  // otherwise be redirected to another site.
  if (!/^[/\\]/.test(req.originalUrl)) return next();
  const q = req.originalUrl.indexOf('?');
  const search = q === -1 ? '' : req.originalUrl.slice(q);
  const path = requestPath(req.originalUrl);
  if (path.length > 1 && path.endsWith('/')) {
    res.redirect(301, path.slice(0, -1) + search);
    return;
  }
  next();
}
