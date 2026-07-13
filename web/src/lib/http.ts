import "server-only";

/**
 * Public origin of the request as the browser sees it.
 *
 * In standalone mode behind the reverse proxy, `request.url` is rebuilt
 * from the container's bind address (https://0.0.0.0:3000), so redirects
 * derived from it would send the browser to the wrong host. Build them
 * from the forwarded headers instead. Trusting these headers is safe in
 * this deployment: the web container publishes no ports, so every request
 * arrives through Caddy, which sets X-Forwarded-Proto and preserves Host.
 * In dev (no proxy) the fallbacks produce http://localhost:3000.
 */
export function publicOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return `${proto}://${host}`;
}
