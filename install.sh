#!/usr/bin/env bash
#  Developer By Azozz ALFiras
# https://github.com/AzozzALFiras/claude-context-optimizer
#
# One-command installer for claude-context-optimizer MCP server
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
echo "  ╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Step 1: Check OS ──────────────────────────────────────────────────────────
step "Step 1/4 — Checking system"

OS="$(uname -s 2>/dev/null || echo 'Unknown')"
case "$OS" in
  Darwin)  OS_NAME="macOS" ;;
  Linux)   OS_NAME="Linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS_NAME="Windows" ;;
  *)       OS_NAME="$OS" ;;
esac

info "Operating system: $OS_NAME"

# ─── Step 2: Check Node.js ─────────────────────────────────────────────────────
step "Step 2/4 — Checking Node.js"

if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Please install Node.js v18+ from https://nodejs.org"
fi

NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js v$NODE_VERSION is too old. Required: v18+. Please upgrade at https://nodejs.org"
fi

success "Node.js v$NODE_VERSION"

if ! command -v npx &>/dev/null; then
  error "npx is not available. Please reinstall Node.js from https://nodejs.org"
fi

success "npx available"

# ─── Step 3: Check Claude Code ─────────────────────────────────────────────────
step "Step 3/4 — Checking Claude Code"

if ! command -v claude &>/dev/null; then
  warn "Claude Code CLI not found in PATH."
  echo ""
  echo "  Install Claude Code first:"
  echo "  → npm install -g @anthropic-ai/claude-code"
  echo "  → Or visit: https://claude.ai/code"
  echo ""
  read -rp "  Continue anyway? (y/N): " CONTINUE
  if [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]]; then
    echo "Installation cancelled."
    exit 0
  fi
fi

if command -v claude &>/dev/null; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
  success "Claude Code: $CLAUDE_VERSION"
fi

# ─── Step 4: Register MCP Server ───────────────────────────────────────────────
step "Step 4/4 — Installing MCP server"

info "Registering claude-context-optimizer as global MCP server..."

if command -v claude &>/dev/null; then
  # Remove existing registration if present (for updates)
  claude mcp remove context-optimizer --scope global 2>/dev/null || true

  # Register globally — available in all Claude Code sessions
  claude mcp add context-optimizer npx claude-context-optimizer --scope global

  success "MCP server registered globally"
else
  warn "Claude Code not found — showing manual registration command:"
  echo ""
  echo "  Run this after installing Claude Code:"
  echo "  ${CYAN}claude mcp add context-optimizer npx claude-context-optimizer --scope global${NC}"
  echo ""
fi

# ─── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  Installation complete!                        ║${NC}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Available tools:${NC}"
echo -e "  ${CYAN}•${NC} compress_logs      — Summarize log files (saves 95% tokens)"
echo -e "  ${CYAN}•${NC} smart_read         — Read only relevant file sections (saves 70-90%)"
echo -e "  ${CYAN}•${NC} file_diff_only     — Git diff instead of full file (saves 85%)"
echo -e "  ${CYAN}•${NC} project_map        — Full project map in ~300 tokens"
echo -e "  ${CYAN}•${NC} context_budget     — Track and optimize token usage"
echo -e "  ${CYAN}•${NC} bulk_search        — Search all files, return snippets only"
echo -e "  ${CYAN}•${NC} recall_file        — Check if file changed since last read"
echo -e "  ${CYAN}•${NC} dependency_graph   — Visualize import relationships"
echo -e "  ${CYAN}•${NC} function_extractor — Extract specific function by name"
echo -e "  ${CYAN}•${NC} session_snapshot   — Save/restore session context"
echo ""
echo -e "  ${BOLD}Next step:${NC} Restart Claude Code — tools are active immediately."
echo ""
echo -e "  ${YELLOW}Verify:${NC} claude mcp list"
echo ""
