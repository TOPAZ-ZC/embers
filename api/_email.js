// Embers — branded confirmation email template
//
// Exports:
//   buildConfirmationEmail({ email, refCode }) -> { subject, html, text }
//   sendConfirmationEmail({ email, refCode, apiKey, fromAddress, replyTo }) -> { ok, status, error? }
//
// Design system tokens (mirrors site/design-system.html):
//   --cream        #fef3e4  page bg
//   --cream-hot    #ffe8c9  soft panel bg
//   --marshmallow  #fff5db  inner card bg
//   --ember        #ff6b35  soft highlight
//   --ember-deep   #e63946  primary accent + italic tagline
//   --sunbeam      #ffb627  warm touch
//   --night        #2b1810  body text + borders
//   --night-soft   #6b4a35  secondary text
//   --log          #a67256  divider
//
// Fonts: Fraunces for display (email-safe fallback: Georgia). Outfit for body
// (fallback: -apple-system, system-ui, Helvetica).
//
// Images: https://tryembers.com/icon-512.png (header campfire mark — rasterized
// 512×512 PNG, reliable across Gmail, Apple Mail, Outlook).
//
// CAN-SPAM: transactional signup confirmation (user requested), but we still
// include physical postal address + reply path for hygiene.

const SITE_URL = 'https://tryembers.com';
const LOGO_URL = `${SITE_URL}/icon-512.png`;
const REPLY_TO = 'hello@tryembers.com';
const POSTAL_ADDRESS = 'Embers by Assay Ventures · Austin, TX'; // TODO: confirm with SLOTH before first production send

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildConfirmationEmail({ email, refCode }) {
  const safeEmail = escapeHtml(email || '');
  const hasRef = !!refCode && /^[A-Z2-9]{8}$/.test(refCode);
  const referralUrl = hasRef ? `${SITE_URL}/?ref=${refCode}` : SITE_URL;
  const safeRef = escapeHtml(refCode || '');
  const safeReferralUrl = escapeHtml(referralUrl);

  const subject = "🔥 You're on the Embers waitlist";
  const preheader = "Founders pricing locked. Here's your referral link to move up the queue.";

  // Email-client-safe HTML: table layout, inline styles, 600px max-width,
  // tested mental model against Gmail iOS / Gmail web / Apple Mail / Outlook.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fef3e4;color:#2b1810;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef3e4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- logo -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <img src="${LOGO_URL}" width="72" height="72" alt="Embers" style="display:block;width:72px;height:72px;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>

          <!-- headline card -->
          <tr>
            <td style="background:#fff5db;border:3px solid #2b1810;border-radius:24px;padding:36px 32px;box-shadow:0 12px 0 #2b1810;">
              <h1 style="margin:0 0 14px;font-family:'Fraunces',Georgia,'Times New Roman',serif;font-weight:700;font-size:40px;line-height:1;letter-spacing:-0.025em;color:#2b1810;">
                You're <em style="font-style:italic;color:#e63946;">in</em>.
              </h1>
              <p style="margin:0 0 18px;font-size:17px;line-height:1.55;color:#2b1810;">
                Welcome to Embers. You're on the waitlist and your founders pricing is locked.
              </p>
              <p style="margin:0 0 8px;font-size:15.5px;line-height:1.55;color:#6b4a35;">
                We'll email you the moment <strong style="color:#2b1810;">Spark</strong> ships — Summer 2026. No spam in between.
              </p>
            </td>
          </tr>

          <!-- divider -->
          <tr>
            <td align="center" style="padding:28px 0;">
              <span style="font-size:18px;color:#a67256;letter-spacing:6px;">🔥&nbsp;·&nbsp;🪵&nbsp;·&nbsp;✨&nbsp;·&nbsp;🪵&nbsp;·&nbsp;🔥</span>
            </td>
          </tr>

          ${hasRef ? `
          <!-- referral block -->
          <tr>
            <td style="background:#ffe8c9;border:3px solid #2b1810;border-radius:24px;padding:32px;box-shadow:0 12px 0 #2b1810;">
              <p style="margin:0 0 6px;font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:600;font-size:17px;color:#e63946;letter-spacing:-0.01em;">
                Move up the queue.
              </p>
              <h2 style="margin:0 0 16px;font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:26px;line-height:1.1;letter-spacing:-0.02em;color:#2b1810;">
                Share your campfire.
              </h2>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#6b4a35;">
                Every friend who joins with your link bumps you up. First access, first founders pricing, first to keep every thread warm.
              </p>

              <!-- referral URL box -->
              <div style="background:#fef3e4;border:2.5px solid #2b1810;border-radius:14px;padding:14px 16px;margin:0 0 18px;">
                <p style="margin:0 0 4px;font-size:11.5px;text-transform:uppercase;letter-spacing:0.09em;font-weight:700;color:#6b4a35;">Your referral link</p>
                <p style="margin:0;font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#2b1810;word-break:break-all;">
                  <a href="${safeReferralUrl}" style="color:#e63946;text-decoration:none;font-weight:600;">${safeReferralUrl}</a>
                </p>
              </div>

              <!-- CTAs: table for Outlook compat -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                <tr>
                  <td align="center" style="padding:0 4px 10px;">
                    <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent("I just joined the Embers waitlist — voice-matched reply drafter, coming Summer 2026. Join me and lock founders pricing: " + referralUrl)}"
                       style="display:inline-block;background:#e63946;color:#fff5db;font-family:'Outfit',-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:100px;border:2.5px solid #2b1810;box-shadow:0 6px 0 #2b1810;">
                      Share on X
                    </a>
                  </td>
                  <td align="center" style="padding:0 4px 10px;">
                    <a href="mailto:?subject=${encodeURIComponent("Thought you'd like this — Embers waitlist")}&body=${encodeURIComponent("Been meaning to tell you about Embers — it drafts replies in your voice, tuned to each person, and sends them through iMessage. Keeps every thread warm when life gets loud.\n\nComing Summer 2026. I locked founders pricing. Here's my referral link so you can too:\n\n" + referralUrl)}"
                       style="display:inline-block;background:#fff5db;color:#2b1810;font-family:'Outfit',-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:100px;border:2.5px solid #2b1810;box-shadow:0 6px 0 #2b1810;">
                      Share via email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b4a35;text-align:center;">
                Your code: <strong style="font-family:'SF Mono',ui-monospace,Menlo,monospace;color:#2b1810;letter-spacing:0.04em;">${safeRef}</strong>
              </p>
            </td>
          </tr>
          ` : ''}

          <!-- what embers does teaser -->
          <tr>
            <td style="padding:32px 8px 0;">
              <h3 style="margin:0 0 10px;font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:20px;letter-spacing:-0.01em;color:#2b1810;">
                While you wait —
              </h3>
              <p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#2b1810;">
                Embers drafts iMessage replies in <em style="font-style:italic;color:#e63946;">your</em> voice — tuned to each person. Dad doesn't sound like your top lead. Your brother doesn't sound like Alex from marketing. Runs on your Mac. Your threads, your phone, your voice.
              </p>
              <p style="margin:0;font-size:15.5px;line-height:1.6;color:#6b4a35;">
                If you want the full picture, the plans, and the pricing — <a href="${SITE_URL}" style="color:#e63946;text-decoration:underline;font-weight:600;">tryembers.com</a>.
              </p>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="padding:40px 8px 0;border-top:2px dashed rgba(43,24,16,0.25);margin-top:32px;">
              <p style="margin:24px 0 6px;font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:700;font-size:20px;color:#2b1810;letter-spacing:-0.01em;">
                Embers
              </p>
              <p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:#6b4a35;">
                keep every thread <em style="font-style:italic;color:#e63946;">warm</em>.
              </p>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:#6b4a35;">
                You're getting this email because <strong style="color:#2b1810;">${safeEmail}</strong> signed up for the Embers waitlist at <a href="${SITE_URL}" style="color:#6b4a35;text-decoration:underline;">tryembers.com</a>. We'll only email you again when Spark ships.
              </p>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:#6b4a35;">
                Didn't sign up? Just ignore this — no account was created, and we won't email you again. Questions? Reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:#6b4a35;text-decoration:underline;">${REPLY_TO}</a>.
              </p>
              <p style="margin:0 0 28px;font-size:12px;line-height:1.55;color:#a67256;">
                ${escapeHtml(POSTAL_ADDRESS)}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text alternative (deliverability + accessibility)
  const text = [
    "🔥 You're on the Embers waitlist.",
    "",
    "Welcome. You're in, and your founders pricing is locked.",
    "",
    "We'll email you the moment Spark ships — Summer 2026. No spam in between.",
    "",
    hasRef ? "— MOVE UP THE QUEUE —" : "",
    hasRef ? "" : "",
    hasRef ? "Every friend who joins with your link bumps you up. First access, first founders pricing." : "",
    hasRef ? "" : "",
    hasRef ? `Your referral link: ${referralUrl}` : "",
    hasRef ? `Your code: ${refCode}` : "",
    hasRef ? "" : "",
    "— WHILE YOU WAIT —",
    "",
    "Embers drafts iMessage replies in your voice — tuned to each person. Dad doesn't sound like your top lead. Runs on your Mac. Your threads, your phone, your voice.",
    "",
    `Full picture: ${SITE_URL}`,
    "",
    "—",
    "Embers — keep every thread warm.",
    "",
    `You're getting this because ${email} signed up at ${SITE_URL}. We'll only email you again when Spark ships.`,
    `Didn't sign up? Ignore this — no account was created. Questions? Reply or write to ${REPLY_TO}.`,
    POSTAL_ADDRESS,
  ].filter((line) => line !== undefined).join("\n");

  return { subject, html, text };
}

// Non-blocking send to Resend. Returns { ok, status, error? }.
// Never throws — the caller (waitlist.js) must not fail the signup if email fails.
async function sendConfirmationEmail({ email, refCode, apiKey, fromAddress }) {
  if (!apiKey) {
    return { ok: false, status: 0, error: 'RESEND_API_KEY not set — email skipped' };
  }
  const from = fromAddress || `Embers <${REPLY_TO}>`;
  const { subject, html, text } = buildConfirmationEmail({ email, refCode });

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: REPLY_TO,
        subject,
        html,
        text,
      }),
    });
    const body = await resp.text().catch(() => '');
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: body.slice(0, 500) };
    }
    return { ok: true, status: resp.status };
  } catch (e) {
    return { ok: false, status: 0, error: (e && e.message) || 'network_error' };
  }
}

module.exports = { buildConfirmationEmail, sendConfirmationEmail };
