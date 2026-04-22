#!/usr/bin/env bash
# embers install — interactive onboarding + LaunchAgent setup
# Run once: ./install.sh

set -euo pipefail

REPO_DIR="$(cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.embers"
CONFIG_FILE="$CONFIG_DIR/config.sh"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.embers.listener.plist"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
dim()  { printf "\033[2m%s\033[0m\n" "$1"; }
red()  { printf "\033[31m%s\033[0m\n" "$1"; }
grn()  { printf "\033[32m%s\033[0m\n" "$1"; }

prompt() {
    local question="$1"
    local default="${2:-}"
    local answer
    if [[ -n "$default" ]]; then
        printf "%s [%s]: " "$question" "$default"
    else
        printf "%s: " "$question"
    fi
    read -r answer
    echo "${answer:-$default}"
}

normalize_phone() {
    local raw="$1"
    local digits
    digits=$(echo "$raw" | /usr/bin/tr -cd '0-9')
    if [[ ${#digits} -eq 10 ]]; then
        digits="1$digits"
    fi
    echo "+$digits"
}

bold "embers installer"
echo "this sets up an auto-reply listener for one person in your iMessage thread."
echo "the listener reads your conversation, drafts replies in your voice via Claude,"
echo "and sends them through iMessage every few minutes."
echo ""

# --- dependency checks ---
bold "checking dependencies..."

CLAUDE_BIN=$(/usr/bin/which claude 2>/dev/null || echo "")
if [[ -z "$CLAUDE_BIN" ]]; then
    red "✗ Claude Code CLI not found on PATH."
    echo "  install: https://docs.claude.com/en/docs/claude-code/quickstart"
    echo "  then re-run this installer."
    exit 1
fi
grn "✓ Claude Code CLI: $CLAUDE_BIN"

PYTHON_BIN=""
for candidate in \
    "/opt/homebrew/Cellar/python@3.11"/*/Frameworks/Python.framework/Versions/3.11/bin/python3.11 \
    "/opt/homebrew/Cellar/python@3.12"/*/Frameworks/Python.framework/Versions/3.12/bin/python3.12 \
    "/opt/homebrew/Cellar/python@3.13"/*/Frameworks/Python.framework/Versions/3.13/bin/python3.13 \
    "/opt/homebrew/bin/python3" \
    "/usr/bin/python3"; do
    if [[ -x "$candidate" ]]; then
        PYTHON_BIN="$candidate"
        break
    fi
done

if [[ -z "$PYTHON_BIN" ]]; then
    red "✗ python3 not found."
    echo "  install via: xcode-select --install  (or brew install python@3.11)"
    exit 1
fi
grn "✓ python: $PYTHON_BIN"

# --- full disk access check ---
if ! "$PYTHON_BIN" -c "import sqlite3; sqlite3.connect('file:$HOME/Library/Messages/chat.db?mode=ro', uri=True).execute('SELECT 1').fetchall()" 2>/dev/null; then
    red "✗ python does not have Full Disk Access to Messages."
    echo ""
    echo "you need to grant it manually:"
    echo "  1. open: System Settings → Privacy & Security → Full Disk Access"
    echo "  2. click +"
    echo "  3. press Cmd+Shift+G and paste this path:"
    echo "       $PYTHON_BIN"
    echo "  4. add it, toggle it ON"
    echo "  5. re-run ./install.sh"
    echo ""
    echo "also grant FDA to /bin/bash the same way (needed for launchd to spawn the listener)."
    /usr/bin/open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null || true
    exit 1
fi
grn "✓ Full Disk Access granted"

echo ""

# --- onboarding questions ---
bold "tell me about the conversation..."

SENDER_NAME=$(prompt "your first name (used in the reply prompt)")
while [[ -z "${SENDER_NAME// }" ]]; do
    SENDER_NAME=$(prompt "your first name")
done

RECIPIENT_NAME=$(prompt "their first name (the person embers replies to)")
while [[ -z "${RECIPIENT_NAME// }" ]]; do
    RECIPIENT_NAME=$(prompt "their first name")
done

RELATIONSHIP=$(prompt "your relationship to them (mom, dad, sister, friend, partner, etc)" "mom")

RECIPIENT_PHONE_RAW=$(prompt "their phone number (US — 10 digits ok, or full +1...)")
RECIPIENT_PHONE=$(normalize_phone "$RECIPIENT_PHONE_RAW")
while [[ ${#RECIPIENT_PHONE} -lt 11 ]]; do
    echo "  that doesn't look like a phone number"
    RECIPIENT_PHONE_RAW=$(prompt "their phone number")
    RECIPIENT_PHONE=$(normalize_phone "$RECIPIENT_PHONE_RAW")
done

echo ""
bold "tone guidance"
echo "describe how you text $RECIPIENT_NAME. short phrase is fine."
echo "example: 'warm, casual, short, no emojis, lots of questions about her day'"
TONE_GUIDANCE=$(prompt "tone" "Be warm, casual, short (1-3 sentences). Match their energy. No emojis.")

echo ""
CHECK_MINUTES=$(prompt "how often should embers check for new messages? (minutes)" "15")
CHECK_INTERVAL=$(( CHECK_MINUTES * 60 ))

# --- write config ---
/bin/mkdir -p "$CONFIG_DIR"
/bin/chmod 700 "$CONFIG_DIR"

/bin/cat > "$CONFIG_FILE" << CONFIG
# embers config — generated $(/bin/date '+%Y-%m-%d %H:%M:%S')
# edit this file anytime to change behavior

SENDER_NAME="$SENDER_NAME"
RECIPIENT_NAME="$RECIPIENT_NAME"
RELATIONSHIP="$RELATIONSHIP"
RECIPIENT_PHONE="$RECIPIENT_PHONE"
CHECK_INTERVAL=$CHECK_INTERVAL
TONE_GUIDANCE="$TONE_GUIDANCE"
PYTHON_BIN="$PYTHON_BIN"
CLAUDE_BIN="$CLAUDE_BIN"
CONFIG

/bin/chmod 600 "$CONFIG_FILE"
grn "✓ config written: $CONFIG_FILE"

# --- write launchd plist ---
/bin/cat > "$LAUNCH_AGENT" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.embers.listener</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$REPO_DIR/bin/listener.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$CONFIG_DIR/listener.log</string>
    <key>StandardErrorPath</key>
    <string>$CONFIG_DIR/listener.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$HOME/.local/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
</dict>
</plist>
PLIST

/usr/bin/plutil -lint "$LAUNCH_AGENT" >/dev/null
grn "✓ launch agent written: $LAUNCH_AGENT"

# --- load agent ---
/bin/launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
/bin/launchctl load "$LAUNCH_AGENT"
grn "✓ listener started"

echo ""
bold "all set."
echo ""
echo "embers is now running and will check the thread every $CHECK_MINUTES minutes."
echo "log:    $CONFIG_DIR/listener.log"
echo "config: $CONFIG_FILE  (edit anytime, then: ./install.sh to reload)"
echo ""
echo "to stop:    ./uninstall.sh"
echo "to pause:   launchctl unload $LAUNCH_AGENT"
echo "to resume:  launchctl load $LAUNCH_AGENT"
echo ""
dim "first check runs immediately. if $RECIPIENT_NAME's last message is newer than your last reply, embers will draft + send one now."
