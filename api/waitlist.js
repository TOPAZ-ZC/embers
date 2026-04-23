// Embers waitlist API — Vercel serverless function (Node 20+)
//
// POST /api/waitlist
//   body: { email, hosting_preference?, tier_interest?, keep_warm_with?, source?,
//           referred_by? (8-char ref_code from URL ?ref=), company? (honeypot) }
//   returns: { success: true, refCode: '...', alreadyRegistered?: bool } | { error }
//
// Calls Supabase RPC create_waitlist_signup (SECURITY DEFINER) so anon can
// insert AND read back the new row's ref_code without a SELECT policy on the
// waitlist table.

const { sendConfirmationEmail } = require('./_email');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cziyronfdqznnqkpfrlh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6aXlyb25mZHF6bm5xa3BmcmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzM1NDcsImV4cCI6MjA5MjQwOTU0N30.eTTMBzKQ2JbsZJ2ENae_3B8whm2doZTH1nRhstPQLKE';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_ADDRESS = process.env.EMBERS_FROM_ADDRESS || 'Embers <hello@tryembers.com>';

const HOSTING_VALUES = new Set(['self_hosted', 'cloud', 'undecided']);
const TIER_VALUES = new Set(['spark', 'ember', 'hearth', 'bonfire', 'forge', 'undecided']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REF_CODE_RE = /^[A-Z2-9]{8}$/;

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

  // Validate referred_by — must match ref_code format if provided
  let referredBy = null;
  if (payload.referred_by) {
    const r = String(payload.referred_by).trim().toUpperCase();
    if (REF_CODE_RE.test(r)) referredBy = r;
  }

  // Call Supabase RPC
  const url = `${SUPABASE_URL}/rest/v1/rpc/create_waitlist_signup`;
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_email: email,
        p_hosting_preference: hosting,
        p_tier_interest: tier,
        p_keep_warm_with: keepWarm,
        p_source: source,
        p_user_agent: userAgent || null,
        p_referrer: referrer,
        p_ip_country: ipCountry,
        p_referred_by: referredBy,
      }),
    });
  } catch (e) {
    return json(res, 502, { error: 'Could not reach the waitlist service. Try again in a moment.' });
  }

  const text = await upstream.text().catch(() => '');
  if (!upstream.ok) {
    console.error('[waitlist] rpc upstream', upstream.status, text);
    return json(res, 500, { error: 'Something went wrong saving your spot. Try again.' });
  }

  let body = [];
  try { body = JSON.parse(text); } catch (_) {}
  const row = Array.isArray(body) && body[0] ? body[0] : {};
  const refCode = row.ref_code || null;
  const alreadyRegistered = !!row.already_registered;

  // On Vercel, background promises can be torn down once the response ends.
  // Await the best-effort send so the fetch gets a real chance to complete,
  // but never fail the signup if email fails or times out.
  if (!alreadyRegistered && refCode && RESEND_API_KEY) {
    const emailResult = await sendConfirmationEmail({
      email,
      refCode,
      apiKey: RESEND_API_KEY,
      fromAddress: FROM_ADDRESS,
    });

    if (!emailResult.ok) {
      console.error('[waitlist] email send failed', emailResult.status, emailResult.error);
    } else {
      console.log('[waitlist] email sent to', email, 'status', emailResult.status);
    }
  }

  return json(res, 200, {
    success: true,
    refCode,
    alreadyRegistered,
  });
};
