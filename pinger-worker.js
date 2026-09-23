/**
 * Vortix Pinger Worker  (v2 - with strict IP validation)
 * Endpoint: https://pinger.vortixx.workers.dev
 *
 * Usage:
 *   GET /ping?count=5&timeout=3000&source=proxy|clean
 */

const SOURCES = {
  proxy: 'https://raw.githubusercontent.com/mahbodrahimi/Vortix-Panel/refs/heads/main/proxy.txt',
  clean: 'https://raw.githubusercontent.com/mahbodrahimi/Vortix-Panel/refs/heads/main/clean-ip.txt',
};

const DEFAULT_SOURCE = 'proxy';
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_TOTAL_BUDGET_MS = 30000;
const MAX_COUNT = 50;
const CONCURRENCY = 10;

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
 * Strict IPv4 validation.
 * Returns true ONLY for valid dotted-decimal IPv4 (0-255 per octet).
 */
function isValidIPv4(str) {
  if (typeof str !== 'string') return false;
  // Must be exactly 4 dot-separated numeric groups, no letters, no dashes, no unicode
  const re = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = re.exec(str);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const n = Number(m[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return false;
    // reject leading zeros like "01" (optional but safer)
    if (m[i].length > 1 && m[i][0] === '0') return false;
  }
  return true;
}

/**
 * Parses a raw list file (one entry per line, optional #Name suffix).
 * Strictly ignores:
 *   - empty lines
 *   - comment lines (starting with #, //, ;)
 *   - separator lines made of ─, -, =, _, *, ~, ·, •, ─, etc.
 *   - any line that doesn't contain a valid IPv4
 */
function parseList(raw) {
  const out = [];
  if (!raw || typeof raw !== 'string') return out;

  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip common comment prefixes
    if (/^(#|\/\/|;)/.test(trimmed)) continue;

    // Skip pure separator lines (dashes, box-drawing, dots, equals, etc.)
    // Examples: ───, ----, ====, ____, ****, ~~~~, ····, •••••, ┈┈┈, ═══
    if (/^[\-─—–═━┈┉╌╍_=*~·•\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\s]+$/.test(trimmed)) {
      continue;
    }

    // Split on first '#' to separate ip from name
    const hashIdx = trimmed.indexOf('#');
    let ipPart, namePart;
    if (hashIdx === -1) {
      ipPart = trimmed;
      namePart = '';
    } else {
      ipPart = trimmed.slice(0, hashIdx).trim();
      namePart = trimmed.slice(hashIdx + 1).trim();
    }

    // Clean up possible surrounding junk characters
    ipPart = ipPart.replace(/[\[\]<>(),;"'`]/g, '').trim();

    // A line may contain "IP:port" or "IP port" — take just the IP portion
    // If it contains whitespace, take the first token that looks like an IP
    if (!isValidIPv4(ipPart)) {
      const tokens = ipPart.split(/\s+/);
      const found = tokens.find(isValidIPv4);
      if (found) {
        ipPart = found;
      } else {
        continue; // not a valid IP line — skip
      }
    }

    if (!isValidIPv4(ipPart)) continue;

    out.push({ ip: ipPart, name: namePart });
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
 * IMPORTANT: We also re-validate the IP before pinging. Any line that
 * slipped through parsing but isn't a real IPv4 will be rejected here.
 */
async function pingIp(ip, timeoutMs) {
  // Guard: never try to ping anything that isn't a valid IPv4
  if (!isValidIPv4(ip)) {
    return { ip, ok: false, latency: null, reason: 'invalid_ip' };
  }

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
    return { ip, ok: false, latency: null, reason: 'unreachable' };
  }
}

async function collectGoodIps(candidates, count, perIpTimeout, totalBudget) {
  const startTime = Date.now();
  const results = [];
  const queue = candidates.slice();

  async function tryOne(candidate) {
    const r = await pingIp(candidate.ip, perIpTimeout);
    return { candidate, ...r };
  }

  while (results.length < count && queue.length > 0) {
    if (Date.now() - startTime >= totalBudget) break;

    const wave = queue.splice(0, CONCURRENCY);
    const settled = await Promise.all(wave.map(tryOne));
    for (const r of settled) {
      if (r.ok && results.length < count) {
        results.push({
          ip: r.candidate.ip,
          name: r.candidate.name,
          latency: r.latency,
        });
      }
    }
  }

  return { results };
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
    return jsonResponse({
      success: false,
      error: 'No valid IPv4 addresses found in source list',
      sourceRawLength: raw.length,
    }, 502);
  }

  shuffle(allEntries);

  const candidates = allEntries.slice(0, Math.min(allEntries.length, count * 10));

  const start = Date.now();
  const { results } = await collectGoodIps(
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
      parsedCount: allEntries.length,
      elapsed,
      ips: [],
    }, 504);
  }

  const ips = results.map((r) => (r.name ? `${r.ip}#${r.name}` : r.ip));

  return jsonResponse({
    success: true,
    ips,
    ipsPlain: results.map((r) => r.ip),
    latencies: results.map((r) => ({ ip: r.ip, latency: r.latency })),
    parsedCount: allEntries.length,
    tested: candidates.length,
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
        version: '2.0.0',
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

    // Debug endpoint: shows what the parser actually extracts
    if (url.pathname === '/debug/parse') {
      const src = (url.searchParams.get('source') || DEFAULT_SOURCE).toLowerCase();
      const sourceUrl = SOURCES[src] || SOURCES[DEFAULT_SOURCE];
      try {
        const res = await fetch(sourceUrl);
        const raw = await res.text();
        const parsed = parseList(raw);
        return jsonResponse({
          success: true,
          source: src,
          rawLength: raw.length,
          rawLines: raw.split(/\r?\n/).length,
          parsedCount: parsed.length,
          first20: parsed.slice(0, 20),
          last5: parsed.slice(-5),
        });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 502);
      }
    }

    return jsonResponse({ success: false, error: 'Not found' }, 404);
  },
};
