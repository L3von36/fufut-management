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
 *
 * Settings endpoint
 * -----------------
 * `/api/settings` is intercepted here and stored directly in Cloudflare KV
 * via the KV REST API (no binding required). Falls back to the upstream
 * Worker if the CF_API_TOKEN secret is not configured.
 */
const WORKER_BASE = 'https://fufut-api.fufutcoffee.workers.dev';
const CF_ACCOUNT_ID = '8793f2ad3a46fcc18960393d39961ba5';
const SETTINGS_KV_ID = '42961d3c761b4f4ca7e0da0de99bc1cc';
const SETTINGS_KEY = 'admin_settings';

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
  let next = cookie.replace(/;\s*[Dd]omain=[^;]+/g, '');
  next = next.replace(/;\s*SameSite=None/gi, '; SameSite=Lax');
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

// ─── Settings handler (KV REST API) ────────────────────────────────
// Uses the Cloudflare KV REST API directly — no binding required.
// Requires CF_API_TOKEN env var (set as a secret in Pages dashboard or via API).
async function handleSettings(request, env) {
  const token = env.CF_API_TOKEN;
  if (!token) {
    return new Response(
      JSON.stringify({ ok: false, error: 'KV not configured — CF_API_TOKEN secret missing' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${SETTINGS_KV_ID}/values/${SETTINGS_KEY}`;
  const cfHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    if (request.method === 'GET') {
      const resp = await fetch(kvUrl, { headers: cfHeaders });
      if (resp.status === 404) {
        return new Response(JSON.stringify({ ok: true, data: {} }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (!resp.ok) {
        const err = await resp.text();
        return new Response(JSON.stringify({ ok: false, error: 'KV read failed', detail: err }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      const data = await resp.json();
      return new Response(JSON.stringify({ ok: true, data }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'PUT' || request.method === 'POST') {
      const patch = await request.json();
      // Read existing
      let existing = {};
      try {
        const getResp = await fetch(kvUrl, { headers: cfHeaders });
        if (getResp.ok) existing = await getResp.json();
      } catch (_) { /* empty on first write */ }
      const updated = { ...existing, ...patch };
      // Write merged
      const putResp = await fetch(kvUrl, {
        method: 'PUT',
        headers: cfHeaders,
        body: JSON.stringify(updated),
      });
      if (!putResp.ok) {
        const err = await putResp.text();
        return new Response(JSON.stringify({ ok: false, error: 'KV write failed', detail: err }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, data: updated }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ─── Main request router ───────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Intercept /api/settings — store in KV via REST API
  if (url.pathname === '/api/settings' || url.pathname === '/api/settings/') {
    return handleSettings(request, env);
  }

  // Everything else → proxy to the upstream Worker
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
  responseHeaders.set('X-Fufut-Proxy', 'active');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
