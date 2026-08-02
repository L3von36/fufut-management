export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return new Response(JSON.stringify({ pathname: url.pathname, search: url.search, href: url.href }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
