// Embers waitlist API — Vercel serverless function (Node 20+)
//
// POST /api/waitlist
//   body: { email, hosting_preference?, tier_interest?, keep_warm_with?, source?, company? (honeypot) }
//   returns: { success: true, alreadyRegistered?: boolean } | { error: string }
//
// Strategy: anon Supabase REST insert via PostgREST. RLS allows anon INSERT only —
// no SELECT/UPDATE/DELETE possible from this key. Server adds user_agent + ip_country
// from edge headers before insert.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cziyronfdqznnqkpfrlh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6aXlyb25mZHF6bm5xa3BmcmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzM1NDcsImV4cCI6MjA5MjQwOTU0N30.eTTMBzKQ2JbsZJ2ENae_3B8whm2doZTH1nRhstPQLKE';

const HOSTING_VALUES = new Set(['self_hosted', 'cloud', 'undecided']);
const TIER_VALUES = new Set(['spark', 'ember', 'hearth', 'bonfire', 'forge', 'undecided']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 32 * 1024) {
        req.destroy();
        reject(new Error('payload_too_large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        const ct = (req.headers['content-type'] || '').toLowerCase();
        if (ct.includes('application/json')) return resolve(JSON.parse(raw));
        // form-encoded fallback (progressive enhancement: <form> POST without JS)
        const params = new URLSearchParams(raw);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        return resolve(obj);
      } catch (e) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (e) {
    const msg = e && e.message === 'payload_too_large' ? 'Payload too large.' : 'Invalid request body.';
    return json(res, 400, { error: msg });
  }

  // Honeypot — silently succeed without storing
  if (typeof payload.company === 'string' && payload.company.trim().length > 0) {
    return json(res, 200, { success: true, honeypot: true });
  }

  const email = (payload.email || '').toString().trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json(res, 400, { error: 'Please enter a valid email address.' });
  }

  let hosting = (payload.hosting_preference || 'undecided').toString();
  if (!HOSTING_VALUES.has(hosting)) hosting = 'undecided';

  let tier = (payload.tier_interest || 'undecided').toString();
  if (!TIER_VALUES.has(tier)) tier = 'undecided';

  let keepWarm = payload.keep_warm_with;
  if (keepWarm !== undefined && keepWarm !== null) {
    keepWarm = String(keepWarm).slice(0, 500);
    if (!keepWarm.trim()) keepWarm = null;
  } else {
    keepWarm = null;
  }

  const source = (payload.source || 'unknown').toString().slice(0, 60);
  const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 500);
  const referrer = (req.headers['referer'] || req.headers['referrer'] || '').toString().slice(0, 500) || null;
  const ipCountry = (req.headers['x-vercel-ip-country'] || '').toString().slice(0, 2).toUpperCase() || null;

  const row = {
    email,
    hosting_preference: hosting,
    tier_interest: tier,
    keep_warm_with: keepWarm,
    source,
    user_agent: userAgent || null,
    referrer,
    ip_country: ipCountry,
  };

  // Plain INSERT via PostgREST. We do NOT use on_conflict / upsert because that
  // path requires an UPDATE RLS policy on the table — and we deliberately don't
  // grant anon UPDATE. Duplicate-email returns 409 from the DB unique constraint,
  // which we translate to "alreadyRegistered" success below.
  const url = `${SUPABASE_URL}/rest/v1/waitlist`;
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(row),
    });
  } catch (e) {
    return json(res, 502, { error: 'Could not reach the waitlist service. Try again in a moment.' });
  }

  if (upstream.status >= 200 && upstream.status < 300) {
    return json(res, 200, { success: true });
  }

  const text = await upstream.text().catch(() => '');
  // 409 Conflict = unique-constraint violation on email (already on the waitlist)
  if (upstream.status === 409) {
    return json(res, 200, { success: true, alreadyRegistered: true });
  }
  console.error('[waitlist] supabase upstream', upstream.status, text);
  return json(res, 500, { error: 'Something went wrong saving your spot. Try again.' });
};
