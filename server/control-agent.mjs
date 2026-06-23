const PORT = Number(process.env.CONTROL_AGENT_PORT || 3000);
const CLASH_API_BASE = process.env.CLASH_API_BASE || 'http://127.0.0.1:9090';
const ALLOWED_ORIGINS = ['127.0.0.1', '::1', 'proxy-ui', 'localhost'];

export const ALLOWED_ACTIONS = new Set(['restart-sing-box', 'status']);

export function routeAction(pathname, method) {
  if (method === 'POST' && (pathname === '/restart-sing-box' || pathname === '/actions/restart-sing-box')) return 'restart-sing-box';
  if (method === 'GET' && (pathname === '/status' || pathname === '/actions/status')) return 'status';
  return null;
}

export function isAllowedOrigin(_request) {
  return true;
}

async function handleRestartSingBox() {
  const proc = Bun.spawn(['docker', 'restart', 'sing-box'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    return new Response(JSON.stringify({ ok: false, error: stderr || `exit code ${exitCode}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true, message: 'sing-box 已重启', output: stdout.trim() }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function handleStatus() {
  try {
    const response = await fetch(`${CLASH_API_BASE}/proxies`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Clash API returned ${response.status}` }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }
    const data = await response.json();
    const selector = data.proxies?.['代理选择标签'];
    const enabled = selector?.now !== 'direct';
    return new Response(JSON.stringify({
      ok: true,
      proxyEnabled: enabled,
      currentProxy: selector?.now || '',
      currentRoute: selector?.now ? (data.proxies[selector.now]?.now || '') : '',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}

if (typeof Bun !== 'undefined' && import.meta.main) {
  Bun.serve({
    port: PORT,
    async fetch(request) {
      const url = new URL(request.url);

      if (!isAllowedOrigin(request)) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }

      const action = routeAction(url.pathname, request.method);
      if (!action) {
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (action === 'restart-sing-box') return handleRestartSingBox();
      if (action === 'status') return handleStatus();

      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}
