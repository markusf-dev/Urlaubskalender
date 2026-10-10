// Urlaubskalender sync: stores one encrypted blob per household.
//
// The browser encrypts the plan with a key that only exists in the household
// link (after the "#", never sent to any server). This worker only ever sees
// the household id (derived one-way from that key) and ciphertext, so it can
// neither read nor decrypt plans.
//
//   GET    /h/:id[?since=v]  -> 200 { version, data, updatedAt } | 204 unchanged | 404
//   PUT    /h/:id            body { version, data }  (version = the one the change is based on, 0 = new)
//                            -> 200 { version, updatedAt } | 409 { version, data, updatedAt }
//   DELETE /h/:id?version=v  -> 204 | 409 | 404

const ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
const MAX_BYTES = 512 * 1024;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (!cors) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/h\/([^/]+)$/);
    if (!match || !ID_PATTERN.test(match[1])) return json({ error: 'not found' }, 404, cors);
    const id = match[1];

    try {
      if (request.method === 'GET') return await getHousehold(env, id, url, cors);
      if (request.method === 'PUT') return await putHousehold(env, id, request, cors);
      if (request.method === 'DELETE') return await deleteHousehold(env, id, url, cors);
      return json({ error: 'method not allowed' }, 405, cors);
    } catch (e) {
      return json({ error: 'server error' }, 500, cors);
    }
  },

  // Daily cleanup of households nobody has touched for a long time.
  async scheduled(event, env) {
    const days = Number(env.RETENTION_DAYS || 730);
    await env.DB.prepare('DELETE FROM households WHERE updated_at < ?')
      .bind(Date.now() - days * 864e5).run();
  },
};

async function getHousehold(env, id, url, cors) {
  const row = await env.DB.prepare('SELECT version, data, updated_at FROM households WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404, cors);
  if (url.searchParams.get('since') === String(row.version)) return new Response(null, { status: 204, headers: cors });
  return json({ version: row.version, data: row.data, updatedAt: row.updated_at }, 200, cors);
}

async function putHousehold(env, id, request, cors) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BYTES) return json({ error: 'too large' }, 413, cors);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413, cors);

  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
  const { version, data } = body || {};
  if (!Number.isInteger(version) || version < 0 || typeof data !== 'string' || !data) {
    return json({ error: 'invalid body' }, 400, cors);
  }

  const now = Date.now();
  const next = version + 1;
  // Optimistic concurrency: only succeeds if nobody saved in between.
  const result = version === 0
    ? await env.DB.prepare('INSERT OR IGNORE INTO households (id, version, data, updated_at) VALUES (?, 1, ?, ?)')
      .bind(id, data, now).run()
    : await env.DB.prepare('UPDATE households SET version = ?, data = ?, updated_at = ? WHERE id = ? AND version = ?')
      .bind(next, data, now, id, version).run();

  if (result.meta.changes === 1) return json({ version: next, updatedAt: now }, 200, cors);

  const current = await env.DB.prepare('SELECT version, data, updated_at FROM households WHERE id = ?').bind(id).first();
  if (!current) return json({ error: 'not found' }, 404, cors);
  return json({ version: current.version, data: current.data, updatedAt: current.updated_at }, 409, cors);
}

async function deleteHousehold(env, id, url, cors) {
  const version = Number(url.searchParams.get('version'));
  const result = await env.DB.prepare('DELETE FROM households WHERE id = ? AND version = ?').bind(id, version).run();
  if (result.meta.changes === 1) return new Response(null, { status: 204, headers: cors });
  const exists = await env.DB.prepare('SELECT version FROM households WHERE id = ?').bind(id).first();
  return json(exists ? { version: exists.version } : { error: 'not found' }, exists ? 409 : 404, cors);
}

// Only the app's own origins may use the API (configured in wrangler.toml).
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin || allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
