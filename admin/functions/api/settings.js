export async function onRequest(context) {
  const { request, env } = context;
  const SETTINGS_KEY = 'admin_settings';

  if (!env.SETTINGS_KV) {
    return new Response(
      JSON.stringify({ ok: false, error: 'KV not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    if (request.method === 'GET') {
      const data = await env.SETTINGS_KV.get(SETTINGS_KEY, 'json') || {};
      return new Response(
        JSON.stringify({ ok: true, data }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (request.method === 'PUT' || request.method === 'POST') {
      const patch = await request.json();
      const existing = await env.SETTINGS_KV.get(SETTINGS_KEY, 'json') || {};
      const updated = { ...existing, ...patch };
      await env.SETTINGS_KV.put(SETTINGS_KEY, JSON.stringify(updated));
      return new Response(
        JSON.stringify({ ok: true, data: updated }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
