# dadbot

An iMessage auto-reply bot that keeps a conversation with one person (a parent, a partner, a friend) warm when you can't.

It reads your thread, drafts a reply in your voice via Claude, and sends it through Messages.app — all locally on your Mac. Nothing leaves your machine except the prompt to Anthropic's API (through Claude Code).

> "My dad texts me all day about food and family. I can't always reply in the moment, but I don't want the thread to go cold. dadbot keeps it alive."

---

## What it does

- Watches one iMessage thread (identified by phone number)
- When the other person sends a message and you haven't replied yet, dadbot drafts a short contextual reply in your voice
- Sends it through your own iMessage (it's literally coming from your Mac, from your number, as you)
- Sleeps, checks again every N minutes
- Runs in the background via launchd — set it and forget it

**It only replies when they message you and you haven't responded yet. It never initiates.**

---

## Requirements

- macOS (uses Messages.app + the chat.db sqlite database)
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/quickstart) installed and logged in
- Python 3 (`python3` on PATH — macOS ships with one, or `brew install python@3.11`)
- iMessage must be set up and working on this Mac with the recipient

---

## Install

```bash
git clone https://github.com/TOPAZ-ZC/dadbot.git
cd dadbot
./install.sh
```

The installer will:

1. Check for Claude Code and python3
2. Verify Full Disk Access (and open System Settings if needed — see below)
3. Ask you a few onboarding questions:
   - Your first name
   - Their first name
   - Your relationship (mom, dad, sister, friend, etc)
   - Their phone number
   - How you text them (tone guidance for the reply prompt)
   - Check interval (default: 15 minutes)
4. Write config to `~/.dadbot/config.sh`
5. Install a LaunchAgent at `~/Library/LaunchAgents/com.dadbot.listener.plist`
6. Start the listener

Log: `~/.dadbot/listener.log`

---

## Full Disk Access — you have to grant this

macOS sandboxes iMessage's database. dadbot reads it read-only, but you still need to explicitly allow Python to access it.

If the installer says FDA isn't granted:

1. Open **System Settings → Privacy & Security → Full Disk Access**
2. Click **+**
3. Press **Cmd + Shift + G** and paste the python path the installer showed you (usually `/opt/homebrew/Cellar/python@3.11/.../python3.11`)
4. Toggle it **ON**
5. Also add **`/bin/bash`** the same way — launchd needs it to spawn the listener
6. Re-run `./install.sh`

---

## Uninstall

```bash
./uninstall.sh
```

Unloads the agent and asks whether to remove `~/.dadbot/` (config + logs).

---

## Pause / resume

```bash
# pause
launchctl unload ~/Library/LaunchAgents/com.dadbot.listener.plist

# resume
launchctl load ~/Library/LaunchAgents/com.dadbot.listener.plist
```

---

## Change settings later

Edit `~/.dadbot/config.sh` directly. Then bounce the agent:

```bash
launchctl unload ~/Library/LaunchAgents/com.dadbot.listener.plist
launchctl load ~/Library/LaunchAgents/com.dadbot.listener.plist
```

---

## How it decides what to send

The listener pulls the last 5 messages from your thread, formats them as a conversation, and asks Claude:

> You are `$SENDER_NAME` replying to your `$RELATIONSHIP` `$RECIPIENT_NAME` via iMessage. `$TONE_GUIDANCE` Never identify as AI. Never overthink it.
>
> Recent conversation: …
>
> Reply to `$RECIPIENT_NAME`'s latest message. Output ONLY the reply text.

The reply goes through iMessage via AppleScript (`tell application "Messages" to send "..." to buddy`). It looks — and is — indistinguishable from you typing it yourself.

---

## Safety rails

- **Read-only** access to chat.db. dadbot never modifies your message history.
- **One-direction only.** It replies when the other person messages you. It never initiates a new conversation.
- **One thread only.** It only watches the phone number in config. Every other conversation is invisible to it.
- **Short replies only.** If Claude's output is under 5 chars or over 500, dadbot skips that turn and logs the skip.
- **Idempotent.** It tracks the last message it replied to and won't double-send.
- **Local.** Everything runs on your Mac. The only network call is Claude Code → Anthropic to generate the reply.

---

## Troubleshooting

**`sqlite3.DatabaseError: authorization denied`**
Full Disk Access isn't granted to your python binary. See the FDA section above.

**The listener starts but never replies**
Check `~/.dadbot/listener.log`. If you see `ALREADY_SEEN` or `LAST_IS_OURS` repeatedly, that's correct — it means there's nothing to reply to.

**Claude replies are weird / out of character**
Edit `TONE_GUIDANCE` in `~/.dadbot/config.sh`. Describe your texting style in plain English. Examples:
- `"short, lowercase, dry humor, never uses punctuation, always asks a follow-up question"`
- `"warm, longer, uses exclamation points, references past conversations"`
- `"matches her energy — if she sends one word, you send one word"`

**I want to stop it replying during certain hours**
Not built-in. Edit `bin/listener.sh` and wrap the Claude call in a time check, or just `launchctl unload` overnight.

---

## License

MIT. See [LICENSE](LICENSE).

---

Built originally so one person could stay connected to his dad through a busy stretch. Shared in case it helps you do the same.
