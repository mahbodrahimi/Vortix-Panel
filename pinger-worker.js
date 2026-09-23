/**
 * Vortix Pinger Worker
 * Endpoint: https://pinger.vortixx.workers.dev
 * 
 * Usage:
 *   GET /ping?count=5&timeout=3000
 *   GET /ping?count=5&timeout=3000&source=proxy   (uses proxy.txt source)
 *   GET /ping?count=5&timeout=3000&source=clean   (uses clean-ip.txt source)
 * 
 * Returns JSON:
 *   { success: true, ips: ["1.2.3.4", "5.6.7.8", ...], tested: 12, elapsed: 2400 }
 */

const SOURCES = {
  proxy: 'https://raw.githubusercontent.com/mahbodrahimi/Vortix-Panel/refs/heads/main/proxy.txt',
  clean: 'https://raw.githubusercontent.com/mahbodrahimi/Vortix-Panel/refs/heads/main/clean-ip.txt',
};

const DEFAULT_SOURCE = 'proxy';
const DEFAULT_TIMEOUT_MS = 3000;      // per-IP ping timeout
const DEFAULT_TOTAL_BUDGET_MS = 30000; // total wall-clock budget
const MAX_COUNT = 50;
const CONCURRENCY = 10;               // parallel pings at a time

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

/**
 * Parses a raw list file (one entry per line, optional #Name suffix).
 * Returns array of { ip, name, flag }
 */
function parseList(raw) {
  const out = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [ipPart, namePart] = trimmed.split('#');
    const ip = (ipPart || '').trim();
    if (!ip) continue;
    out.push({ ip, name: (namePart || '').trim() });
  }
  return out;
}

/** Fisher-Yates shuffle (in place) */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pings a single IP (TCP connect via fetch with no-cors + timeout).
 * Returns { ip, ok, latency } — latency in ms, or null on failure.
 *
 * We use `fetch` with a HEAD-like request to `https://<ip>/` and treat
 * any response (including CORS errors) as a reachable host. Network
 * errors and timeouts → unreachable.
 */
async function pingIp(ip, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    await fetch(`https://${ip}/?_=${start}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ip, ok: true, latency: Date.now() - start };
  } catch (e) {
    clearTimeout(timer);
    // Distinguish abort (timeout) vs other errors: both are "fail" for our purpose
    return { ip, ok: false, latency: null };
  }
}

/**
 * Runs pings with limited concurrency until we have `count` successes
 * or the total budget is exhausted.
 */
async function collectGoodIps(candidates, count, perIpTimeout, totalBudget) {
  const startTime = Date.now();
  const results = [];
  const tried = new Set();
  let testedCount = 0;

  // Work queue (mutable copy)
  const queue = candidates.slice();

  // Helper: try one candidate, return {ip, ok, latency}
  async function tryOne(candidate) {
    testedCount++;
    tried.add(candidate.ip);
    const r = await pingIp(candidate.ip, perIpTimeout);
    return { candidate, ...r };
  }

  // Run in waves of CONCURRENCY
  while (results.length < count && queue.length > 0) {
    if (Date.now() - startTime >= totalBudget) break;

    const wave = queue.splice(0, CONCURRENCY);
    const settled = await Promise.all(wave.map(tryOne));
    for (const r of settled) {
      if (r.ok && results.length < count) {
        results.push({ ip: r.candidate.ip, name: r.candidate.name, latency: r.latency });
      }
    }
  }

  return { results, testedCount, triedCount: tried.size };
}

async function handlePing(request, env) {
  const url = new URL(request.url);
  const countParam = parseInt(url.searchParams.get('count') || '5', 10);
  const timeoutParam = parseInt(url.searchParams.get('timeout') || String(DEFAULT_TIMEOUT_MS), 10);
  const sourceParam = (url.searchParams.get('source') || DEFAULT_SOURCE).toLowerCase();

  const count = Math.max(1, Math.min(MAX_COUNT, isFinite(countParam) ? countParam : 5));
  const perIpTimeout = Math.max(500, Math.min(15000, isFinite(timeoutParam) ? timeoutParam : DEFAULT_TIMEOUT_MS));

  const sourceUrl = SOURCES[sourceParam] || SOURCES[DEFAULT_SOURCE];

  let raw;
  try {
    const res = await fetch(sourceUrl, { cf: { cacheTtl: 60 } });
    if (!res.ok) {
      return jsonResponse({ success: false, error: `Source fetch failed: HTTP ${res.status}` }, 502);
    }
    raw = await res.text();
  } catch (e) {
    return jsonResponse({ success: false, error: `Source fetch error: ${e.message}` }, 502);
  }

  const allEntries = parseList(raw);
  if (allEntries.length === 0) {
    return jsonResponse({ success: false, error: 'Source list is empty' }, 502);
  }

  // Shuffle to get random IPs from different regions of the list
  shuffle(allEntries);

  // Try to fetch more than `count` in case some fail (up to 10x, capped at list size)
  const candidates = allEntries.slice(0, Math.min(allEntries.length, count * 10));

  const start = Date.now();
  const { results, testedCount } = await collectGoodIps(
    candidates,
    count,
    perIpTimeout,
    DEFAULT_TOTAL_BUDGET_MS,
  );
  const elapsed = Date.now() - start;

  if (results.length === 0) {
    return jsonResponse({
      success: false,
      error: 'No reachable IPs found within time budget',
      tested: testedCount,
      elapsed,
      ips: [],
    }, 504);
  }

  // Return in the same `ip#name` format used by the frontend
  const ips = results.map((r) => (r.name ? `${r.ip}#${r.name}` : r.ip));

  return jsonResponse({
    success: true,
    ips,
    ipsPlain: results.map((r) => r.ip),
    latencies: results.map((r) => ({ ip: r.ip, latency: r.latency })),
    tested: testedCount,
    found: results.length,
    requested: count,
    elapsed,
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        success: true,
        service: 'vortix-pinger',
        version: '1.0.0',
        endpoints: ['/ping?count=N&timeout=MS&source=proxy|clean'],
      });
    }

    if (url.pathname === '/ping') {
      try {
        return await handlePing(request, env);
      } catch (e) {
        return jsonResponse({ success: false, error: e.message || 'Internal error' }, 500);
      }
    }

    return jsonResponse({ success: false, error: 'Not found' }, 404);
  },
};
