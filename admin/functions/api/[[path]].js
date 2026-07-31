/**
 * Cloudflare Pages Function — Same-origin API proxy for the admin app.
 *
 * Why this exists
 * ---------------
 * The browser lives on `admin.fufutcoffee.com` and the API lives on
 * `fufut-api.fufutcoffee.workers.dev`. Cross-origin requests drop the
 * session cookie on modern browsers (Safari ITP, Firefox strict, Brave,
 * Chrome privacy features) because the cookie is a third-party cookie.
 *
 * This function makes every `/api/*` request a same-origin call from the
 * browser's perspective. The function server-side:
 *   1. Forwards the request (and the browser's cookies) to the Worker.
 *   2. Reads the `Set-Cookie` headers the Worker returns and rewrites
 *      them so the cookie is stored on `admin.fufutcoffee.com` (first-
 *      party) instead of the Worker origin (third-party). Without this
 *      rewrite, the session would still never persist in the browser.
 *   3. Strips CORS headers — not needed for same-origin responses.
 */
const WORKER_BASE = 'https://fufut-api.fufutcoffee.workers.dev';

// Headers that should never be forwarded to the upstream Worker.
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'cf-connecting-ip',
  'cf-ray',
  'cf-worker',
  'cf-visitor',
  'x-forwarded-proto',
  'x-forwarded-for',
  'x-real-ip',
]);

// Headers that should never be returned to the browser.
const STRIP_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
  'vary',
  'content-length',
  'content-encoding',
]);

// Headers that should be preserved when stripping content-encoding.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function rewriteSetCookie(cookie) {
  // Strip Domain so the browser attaches the cookie to the current origin
  // (admin.fufutcoffee.com) instead of the Worker origin.
  let next = cookie.replace(/;\s*[Dd]omain=[^;]+/g, '');
  // Same-origin requests don't need SameSite=None; Lax is enough and is
  // friendlier to older browsers.
  next = next.replace(/;\s*SameSite=None/gi, '; SameSite=Lax');
  // Constrain path to /api to avoid leaking the session cookie to other
  // paths on the admin origin.
  if (!/;\s*[Pp]ath=/i.test(next)) {
    next += '; Path=/api';
  }
  return next;
}

function buildOutgoingHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of request.headers.entries()) {
    if (STRIP_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    headers.set(name, value);
  }
  // Help the Worker recognise the original admin origin even when the
  // function itself sends a server-to-server fetch (no browser Origin).
  if (!headers.has('origin')) {
    headers.set('origin', 'https://admin.fufutcoffee.com');
  }
  if (!headers.has('referer')) {
    headers.set('referer', 'https://admin.fufutcoffee.com/');
  }
  return headers;
}

function buildResponseHeaders(response) {
  const headers = new Headers();
  for (const [name, value] of response.headers.entries()) {
    if (STRIP_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    headers.set(name, value);
  }
  // Use getSetCookie() when available; otherwise fall back to the raw
  // header value. Either way, rewrite the cookie so it sticks to the
  // admin origin.
  let setCookieValues = [];
  if (typeof response.headers.getSetCookie === 'function') {
    setCookieValues = response.headers.getSetCookie();
  } else {
    const raw = response.headers.get('set-cookie');
    if (raw) setCookieValues = [raw];
  }
  for (const cookie of setCookieValues) {
    if (!cookie) continue;
    headers.append('Set-Cookie', rewriteSetCookie(cookie));
  }
  return headers;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = WORKER_BASE + url.pathname + url.search;

  const isBodyMethod = !['GET', 'HEAD'].includes(request.method.toUpperCase());

  const upstreamHeaders = buildOutgoingHeaders(request);

  const upstreamRequest = new Request(target, {
    method: request.method,
    headers: upstreamHeaders,
    body: isBodyMethod ? request.body : undefined,
    redirect: 'follow',
  });

  let response;
  try {
    response = await fetch(upstreamRequest);
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'API unavailable', detail: String(err && err.message || err) }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const responseHeaders = buildResponseHeaders(response);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
