# Embers

> keep every thread warm

Voice-matched reply drafter for every relationship. A different voice for every person. Self-Hosted (your Mac) or Cloud (we host). **Coming Summer 2026 — [join the waitlist at tryembers.com](https://tryembers.com).**

---

## Repo layout

```
embers/
├── site/              ← marketing + waitlist site (Vercel target)
│   ├── index.html        ← landing page with waitlist modal
│   ├── design-system.html
│   ├── privacy.html
│   └── terms.html
├── api/               ← Vercel serverless functions
│   └── waitlist.js       ← POST /api/waitlist → Supabase
├── vercel.json        ← Vercel routing + headers
├── bin/               ← Self-Hosted bridge (Mac listener)
├── install.sh         ← Self-Hosted install
├── uninstall.sh       ← Self-Hosted uninstall
└── config.sh.example  ← Self-Hosted config template
```

The marketing site (`site/` + `api/`) deploys to Vercel. The Self-Hosted bridge (`bin/`, `install.sh`) is the Mac listener that customers run locally for the Self-Hosted tier.

---

## Deploying the waitlist site to Vercel

The site is plain static HTML + a single Node serverless function. No build step.

### One-time setup

1. **Import the repo into Vercel.**
   - Vercel dashboard → New Project → import `TOPAZ-ZC/embers`
   - Owner: **Assay Ventures** team
   - Framework Preset: **Other** (Vercel auto-detects from `vercel.json`)
   - Root directory: leave at repo root
   - Build & Output Settings: leave defaults — `vercel.json` sets `outputDirectory: "site"` and points functions at `api/`

2. **Environment variables** (Vercel dashboard → Project Settings → Environment Variables).

   Both are optional — defaults are baked into [api/waitlist.js](api/waitlist.js) so the route works without any env vars set. Override only if you ever rotate keys or point at a different Supabase project.

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | `https://cziyronfdqznnqkpfrlh.supabase.co` |
   | `SUPABASE_ANON_KEY` | (anon JWT — see Supabase dashboard → Project Settings → API) |

   Apply to: Production + Preview + Development.

3. **Custom domain.**
   - Vercel dashboard → Domains → add `tryembers.com`
   - Vercel will give you DNS records (either nameservers or A/CNAME records)
   - Set the records at your registrar (Namecheap, Porkbun, etc.)
   - Wait for propagation (~5-30 min usually)

4. **Plausible Analytics** (cookie-free).
   - Sign up at [plausible.io](https://plausible.io) (or self-host Plausible CE)
   - Add `tryembers.com` as a site
   - The `<script>` tag is already in `site/index.html`, `privacy.html`, `terms.html` — events flow as soon as the domain is verified

### Deploy

Vercel auto-deploys on every push to `main`. To deploy manually:

```bash
vercel --cwd ~/embers           # preview deploy
vercel --prod --cwd ~/embers    # production deploy
```

### Verify after deploy

```bash
# 1. Site loads
curl -sI https://tryembers.com/ | head -3

# 2. Privacy + terms
curl -sI https://tryembers.com/privacy | head -3
curl -sI https://tryembers.com/terms | head -3

# 3. API rejects GET
curl -sI https://tryembers.com/api/waitlist | head -3   # expect 405

# 4. API accepts POST + writes to Supabase
curl -sX POST https://tryembers.com/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test@example.com","hosting_preference":"undecided","tier_interest":"undecided","source":"smoke-test"}'
# expect: {"success":true}

# 5. Re-submit same email — should also succeed (ignore-duplicates)
curl -sX POST https://tryembers.com/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test@example.com","hosting_preference":"undecided","tier_interest":"undecided","source":"smoke-test"}'

# 6. Read the row back via Supabase MCP or dashboard:
#    select email, hosting_preference, tier_interest, source, ip_country, created_at
#    from waitlist where email = 'smoke-test@example.com';
```

---

## Database

Supabase project: [cziyronfdqznnqkpfrlh](https://supabase.com/dashboard/project/cziyronfdqznnqkpfrlh). Region: us-east-1. Org: Assay Ventures.

### Schema

- `waitlist` — single table, citext-unique email, hosting_preference + tier_interest enums, source/UA/referrer/ip_country capture
- `waitlist_stats` — view: total + per-hosting-preference counts + last-24h / last-7d cohorts
- RLS: anon can INSERT only. No SELECT/UPDATE/DELETE possible from the public key.

Migrations applied:
- `init_waitlist` — table, enums, indexes, updated_at trigger, RLS-on, stats view
- `waitlist_anon_insert_policy` — anon INSERT policy with defense-in-depth length checks

To inspect signups (admin):

```sql
-- Recent signups
select email, hosting_preference, tier_interest, source, ip_country, created_at
from waitlist
order by created_at desc
limit 50;

-- Cohort breakdown
select * from waitlist_stats;
```

Run via [Supabase SQL Editor](https://supabase.com/dashboard/project/cziyronfdqznnqkpfrlh/sql) or `mcp__85f8dfd8-…__execute_sql`.

---

## Self-Hosted bridge (the Mac listener — for customers post-launch)

> The rest of this README documents the original Mac-side iMessage bridge. This is the Self-Hosted execution layer — what runs on a customer's Mac when they pick the Self-Hosted tier. It is not part of the Vercel marketing-site deploy.

It reads your thread, drafts a reply in your voice via Claude, and sends it through Messages.app — all locally on your Mac. Nothing leaves your machine except the prompt to Anthropic's API (through Claude Code).

### What it does

- Watches one iMessage thread (identified by phone number)
- When the other person sends a message and you haven't replied yet, Embers drafts a short contextual reply in your voice
- Sends it through your own iMessage (it's literally coming from your Mac, from your number, as you)
- Sleeps, checks again every N minutes
- Runs in the background via launchd — set it and forget it

**It only replies when they message you and you haven't responded yet. It never initiates.**

### Requirements

- macOS (uses Messages.app + the chat.db sqlite database)
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/quickstart) installed and logged in
- Python 3 (`python3` on PATH — macOS ships with one, or `brew install python@3.11`)
- iMessage must be set up and working on this Mac with the recipient

### Install

```bash
git clone https://github.com/TOPAZ-ZC/embers.git
cd embers
./install.sh
```

The installer will:

1. Check for Claude Code and python3
2. Verify Full Disk Access (and open System Settings if needed — see below)
3. Ask you a few onboarding questions (name, recipient, tone, interval)
4. Write config to `~/.embers/config.sh`
5. Install a LaunchAgent at `~/Library/LaunchAgents/com.embers.listener.plist`
6. Start the listener

Log: `~/.embers/listener.log`

### Full Disk Access — you have to grant this

macOS sandboxes iMessage's database. Embers reads it read-only, but you still need to explicitly allow Python to access it.

If the installer says FDA isn't granted:

1. Open **System Settings → Privacy & Security → Full Disk Access**
2. Click **+**
3. Press **Cmd + Shift + G** and paste the python path the installer showed you (usually `/opt/homebrew/Cellar/python@3.11/.../python3.11`)
4. Toggle it **ON**
5. Also add **`/bin/bash`** the same way — launchd needs it to spawn the listener
6. Re-run `./install.sh`

### Pause / resume / uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.embers.listener.plist   # pause
launchctl load   ~/Library/LaunchAgents/com.embers.listener.plist   # resume
./uninstall.sh                                                       # remove
```

### Safety rails

- **Read-only** access to chat.db. Embers never modifies your message history.
- **One-direction only.** It replies when the other person messages you. It never initiates a new conversation.
- **One thread only** (v1). It only watches the phone number in config.
- **Short replies only.** If Claude's output is under 5 chars or over 500, Embers skips that turn and logs the skip.
- **Idempotent.** It tracks the last message it replied to and won't double-send.
- **Local.** Everything runs on your Mac. The only network call is Claude Code → Anthropic to generate the reply.

### Troubleshooting

**`sqlite3.DatabaseError: authorization denied`** — Full Disk Access isn't granted to your python binary. See the FDA section above.

**The listener starts but never replies** — Check `~/.embers/listener.log`. If you see `ALREADY_SEEN` or `LAST_IS_OURS` repeatedly, that's correct — there's nothing to reply to.

**Claude replies are weird / out of character** — Edit `TONE_GUIDANCE` in `~/.embers/config.sh`. Describe your texting style in plain English.

---

## License

MIT. See [LICENSE](LICENSE).

---

Built originally so one person could stay connected to his dad through a busy stretch. Now growing into a full product so anyone can keep every thread warm.
