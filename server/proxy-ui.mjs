const port = Number(process.env.PORT || 80);
const apiBase = process.env.CLASH_API_BASE || 'http://host.docker.internal:9090';
const controlAgentBase = process.env.CONTROL_AGENT_BASE || process.env.CONTROL_AGENT_URL || 'http://control-agent:8080';
const root = process.env.PROXY_UI_ROOT || new URL('../ui', import.meta.url).pathname;

const ALLOWED_CONTROL_ACTIONS = new Set(['restart-sing-box']);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

export function apiTargetUrl(pathname, search = '', base = apiBase) {
  return new URL(pathname.replace(/^\/api/, '') + search, base).toString();
}

function contentType(pathname) {
  const ext = pathname.match(/\.[^.]+$/)?.[0];
  return contentTypes[ext || ''] || 'application/octet-stream';
}

async function proxyApi(request, url) {
  const target = apiTargetUrl(url.pathname, url.search);
  const headers = new Headers(request.headers);
  headers.delete('host');
  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });
}

async function proxyControlAgent(request, url) {
  const target = new URL(url.pathname.replace(/^\/ctl/, '') + url.search, controlAgentBase).toString();
  const headers = new Headers(request.headers);
  headers.delete('host');
  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });
}

export function isAllowedControlAction(action) {
  return ALLOWED_CONTROL_ACTIONS.has(action);
}

export function controlActionTargetUrl(action, base = controlAgentBase) {
  return `${base}/actions/${action}`;
}

export function sanitizeControlResponse(response) {
  const { ok, summary, timestamp } = response;
  return { ok, summary, timestamp };
}

async function handleControlAction(request, url) {
  const match = url.pathname.match(/^\/api\/control\/actions\/(.+)$/);
  if (!match) return null;
  const action = match[1];
  if (!isAllowedControlAction(action)) {
    return new Response(JSON.stringify({ ok: false, summary: `动作 ${action} 不在白名单中`, timestamp: new Date().toISOString() }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    const target = controlActionTargetUrl(action);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('content-type', 'application/json');
    const res = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    const sanitized = sanitizeControlResponse(data);
    return new Response(JSON.stringify(sanitized), {
      status: res.ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({
      ok: false,
      summary: 'control-agent 不可达',
      timestamp: new Date().toISOString(),
    }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export { contentType };

export async function serveStatic(url) {
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const safePath = pathname.includes('..') ? '/index.html' : pathname;
  let file = Bun.file(`${root}${safePath}`);
  if (!(await file.exists())) file = Bun.file(`${root}/index.html`);
  return new Response(file, { headers: { 'content-type': contentType(file.name || safePath) } });
}

if (typeof Bun !== 'undefined' && import.meta.main) {
  Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/ctl/')) return proxyControlAgent(request, url);
      if (url.pathname.startsWith('/api/control/actions/')) return handleControlAction(request, url) || new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      if (url.pathname.startsWith('/api/')) return proxyApi(request, url);
      return serveStatic(url);
    },
  });
}
