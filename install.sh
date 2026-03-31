#!/usr/bin/env bash
#  Developer By Azozz ALFiras
# https://github.com/AzozzALFiras/claude-context-optimizer
#
# One-command installer for claude-context-optimizer MCP server
# Supports: Claude Code, GitHub Copilot (VS Code), and any MCP-compatible client
# Usage: curl -fsSL https://raw.githubusercontent.com/AzozzALFiras/claude-context-optimizer/main/install.sh | bash

set -euo pipefail

# ─── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[✓]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[✗]${NC}    $*"; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}$*${NC}"; }

# ─── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔════════════════════════════════════════════════╗"
echo "  ║     Claude Context Optimizer — Installer       ║"
echo "  ║     Reduce token usage by up to 84%            ║"
echo "  ║     by Azozz ALFiras                           ║"
echo "  ║     Supports: Claude Code + GitHub Copilot     ║"
echo "  ╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Resolve project directory ─────────────────────────────────────────────────
# When piped through curl, BASH_SOURCE[0] is empty — fall back to cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$PWD}")" 2>/dev/null && pwd)" || SCRIPT_DIR="$PWD"

# Verify this is the right directory
if [[ ! -f "$SCRIPT_DIR/package.json" ]] || ! grep -q '"claude-context-optimizer"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
  error "Run this script from inside the claude-context-optimizer project directory.\n  cd /path/to/claude-context-optimizer && bash install.sh"
fi

info "Project directory: $SCRIPT_DIR"

# ─── Step 1: Check OS ──────────────────────────────────────────────────────────
step "Step 1/5 — Checking system"

OS="$(uname -s 2>/dev/null || echo 'Unknown')"
case "$OS" in
  Darwin)               OS_NAME="macOS" ;;
  Linux)                OS_NAME="Linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS_NAME="Windows" ;;
  *)                    OS_NAME="$OS" ;;
esac

info "Operating system: $OS_NAME"

# ─── Step 2: Check Node.js ─────────────────────────────────────────────────────
step "Step 2/5 — Checking Node.js"

if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Please install Node.js v18+ from https://nodejs.org"
fi

NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js v$NODE_VERSION is too old. Required: v18+. Please upgrade at https://nodejs.org"
fi

success "Node.js v$NODE_VERSION"

if ! command -v npm &>/dev/null; then
  error "npm is not available. Please reinstall Node.js from https://nodejs.org"
fi

success "npm available"

# ─── Step 3: Build the project ─────────────────────────────────────────────────
step "Step 3/5 — Building the MCP server"

cd "$SCRIPT_DIR"

info "Installing dependencies..."
npm install --silent
success "Dependencies installed"

info "Compiling TypeScript..."
npm run build
success "Build complete — dist/ ready"

SERVER_ENTRY="$SCRIPT_DIR/dist/server/index.js"
if [[ ! -f "$SERVER_ENTRY" ]]; then
  error "Build succeeded but $SERVER_ENTRY not found. Check tsconfig.json."
fi
success "Server entry: $SERVER_ENTRY"

# ─── Step 4: Register with Claude Code ─────────────────────────────────────────
step "Step 4/5 — Registering with Claude Code"

if command -v claude &>/dev/null; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
  info "Claude Code: $CLAUDE_VERSION"

  # Remove any existing registration, then re-add using local path
  (cd "$HOME" && claude mcp remove context-optimizer --scope user 2>/dev/null || true)
  (cd "$HOME" && claude mcp add context-optimizer node "$SERVER_ENTRY" --scope user)

  success "Registered with Claude Code (user scope)"
else
  warn "Claude Code CLI not found — skipping. To register manually:"
  echo ""
  echo "  ${CYAN}claude mcp add context-optimizer node \"$SERVER_ENTRY\" --scope user${NC}"
  echo ""
fi

# ─── Step 5: Register with VS Code / GitHub Copilot ───────────────────────────
step "Step 5/5 — Registering with VS Code / GitHub Copilot"

# Locate VS Code user settings directory
case "$OS" in
  Darwin)
    VSCODE_SETTINGS_DIR="$HOME/Library/Application Support/Code/User"
    ;;
  Linux)
    VSCODE_SETTINGS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/Code/User"
    ;;
  Windows|MINGW*|MSYS*|CYGWIN*)
    VSCODE_SETTINGS_DIR="${APPDATA:-$HOME/AppData/Roaming}/Code/User"
    ;;
  *)
    VSCODE_SETTINGS_DIR="$HOME/.config/Code/User"
    ;;
esac

VSCODE_SETTINGS_FILE="$VSCODE_SETTINGS_DIR/settings.json"

if [[ ! -d "$VSCODE_SETTINGS_DIR" ]]; then
  warn "VS Code settings directory not found at: $VSCODE_SETTINGS_DIR"
  warn "VS Code may not be installed or may be using a different profile path."
  echo ""
  echo "  To register manually, add this to your VS Code settings.json:"
  echo ""
  echo "  ${CYAN}\"mcp\": {"
  echo "    \"servers\": {"
  echo "      \"context-optimizer\": {"
  echo "        \"type\": \"stdio\","
  echo "        \"command\": \"node\","
  echo "        \"args\": [\"$SERVER_ENTRY\"]"
  echo "      }"
  echo "    }"
  echo "  }${NC}"
  echo ""
else
  # Use node to merge the MCP server entry into settings.json safely
  node - "$VSCODE_SETTINGS_FILE" "$SERVER_ENTRY" <<'NODEEOF'
const fs = require('fs');
const path = require('path');
const settingsFile = process.argv[2];
const serverEntry = process.argv[3];

let settings = {};

// Read existing settings if present
if (fs.existsSync(settingsFile)) {
  try {
    const raw = fs.readFileSync(settingsFile, 'utf8')
      // Strip single-line comments (VS Code allows them in settings.json)
      .replace(/\/\/[^\n]*/g, '')
      // Strip trailing commas before } or ]
      .replace(/,(\s*[}\]])/g, '$1');
    settings = JSON.parse(raw);
  } catch (e) {
    console.error('[WARN]  Could not parse existing settings.json — creating backup and starting fresh.');
    fs.copyFileSync(settingsFile, settingsFile + '.bak-' + Date.now());
    settings = {};
  }
}

// Merge MCP server entry
if (!settings.mcp) settings.mcp = {};
if (!settings.mcp.servers) settings.mcp.servers = {};

settings.mcp.servers['context-optimizer'] = {
  type: 'stdio',
  command: 'node',
  args: [serverEntry]
};

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log('[✓]    VS Code settings.json updated');
NODEEOF

  success "Registered with VS Code / GitHub Copilot"
  info "Settings file: $VSCODE_SETTINGS_FILE"
fi

# Also write a workspace-level .vscode/mcp.json for repo-local use
WORKSPACE_MCP="$SCRIPT_DIR/.vscode/mcp.json"
mkdir -p "$SCRIPT_DIR/.vscode"
cat > "$WORKSPACE_MCP" <<WSEOF
{
  "servers": {
    "context-optimizer": {
      "type": "stdio",
      "command": "node",
      "args": ["$SERVER_ENTRY"]
    }
  }
}
WSEOF
success "Workspace MCP config written: .vscode/mcp.json"

# ─── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  Installation complete!                        ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Active in:${NC}"
echo -e "  ${CYAN}•${NC} Claude Code       — restart if already open"
echo -e "  ${CYAN}•${NC} GitHub Copilot    — restart VS Code (or reload window)"
echo -e "  ${CYAN}•${NC} Any MCP client    — point to: ${CYAN}node \"$SERVER_ENTRY\"${NC}"
echo ""
echo -e "  ${BOLD}Available tools:${NC}"
echo -e "  ${CYAN}•${NC} compress_logs       — Summarize log files (saves 95% tokens)"
echo -e "  ${CYAN}•${NC} smart_read          — Read only relevant file sections (saves 70-90%)"
echo -e "  ${CYAN}•${NC} file_diff_only      — Git diff instead of full file (saves 85%)"
echo -e "  ${CYAN}•${NC} project_map         — Full project map in ~300 tokens"
echo -e "  ${CYAN}•${NC} context_budget      — Track and optimize token usage"
echo -e "  ${CYAN}•${NC} bulk_search         — Search all files, return snippets only"
echo -e "  ${CYAN}•${NC} recall_file         — Check if file changed since last read"
echo -e "  ${CYAN}•${NC} dependency_graph    — Visualize import relationships"
echo -e "  ${CYAN}•${NC} function_extractor  — Extract specific function by name"
echo -e "  ${CYAN}•${NC} session_snapshot    — Save/restore session context"
echo -e "  ${CYAN}•${NC} task_manager        — Persist multi-step task progress"
echo -e "  ${CYAN}•${NC} context_watchdog    — Warn when context window is filling up"
echo ""
echo -e "  ${YELLOW}Verify Claude Code:${NC} claude mcp list"
echo -e "  ${YELLOW}Verify VS Code:${NC} Open Command Palette → 'MCP: List Servers'"
echo ""
