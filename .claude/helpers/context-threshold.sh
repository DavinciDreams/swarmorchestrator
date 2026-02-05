#!/bin/bash
# Claude Flow V3 - Context Threshold Management
# Monitors context usage and triggers actions at 90% threshold:
# - Auto-summarize conversation context
# - Save important context to memory
# - Spawn new session with transferred context
#
# Hook integration points:
# - PostToolUse: Track context growth
# - UserPromptSubmit: Check threshold before processing
# - Custom: Manual threshold check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTEXT_DIR="$PROJECT_ROOT/.claude-flow/context"
STATE_FILE="$CONTEXT_DIR/threshold-state.json"
SUMMARY_FILE="$CONTEXT_DIR/current-summary.md"
HANDOFF_FILE="$CONTEXT_DIR/handoff-context.json"

# Configuration
THRESHOLD_PERCENT="${CONTEXT_THRESHOLD_PERCENT:-90}"
MAX_CONTEXT_TOKENS="${MAX_CONTEXT_TOKENS:-200000}"  # Claude's context window
WARN_THRESHOLD="${CONTEXT_WARN_THRESHOLD:-80}"

# Initialize directories
mkdir -p "$CONTEXT_DIR"

# =============================================================================
# STATE MANAGEMENT
# =============================================================================

init_state() {
  if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" << EOF
{
  "estimatedTokens": 0,
  "messageCount": 0,
  "toolCallCount": 0,
  "lastCheck": "$(date -Iseconds)",
  "thresholdReached": false,
  "summaryGenerated": false,
  "memoryPersisted": false,
  "sessionSpawned": false,
  "warnings": [],
  "sessionId": "${SESSION_ID:-session_$(date +%s)}",
  "checkpoints": []
}
EOF
  fi
}

get_state() {
  init_state
  cat "$STATE_FILE"
}

update_state() {
  local key="$1"
  local value="$2"
  init_state

  if command -v jq &>/dev/null; then
    jq ".$key = $value | .lastCheck = \"$(date -Iseconds)\"" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  fi
}

increment_state() {
  local key="$1"
  local amount="${2:-1}"
  init_state

  if command -v jq &>/dev/null; then
    local current=$(jq -r ".$key // 0" "$STATE_FILE")
    local new=$((current + amount))
    update_state "$key" "$new"
  fi
}

# =============================================================================
# TOKEN ESTIMATION
# =============================================================================

# Rough estimation: ~4 characters per token for English text
estimate_tokens() {
  local text="$1"
  local char_count=${#text}
  echo $((char_count / 4))
}

track_message() {
  local content="${1:-}"
  local role="${2:-user}"

  if [ -n "$content" ]; then
    local tokens=$(estimate_tokens "$content")
    increment_state "estimatedTokens" "$tokens"
    increment_state "messageCount" 1

    # Add to recent context for summarization
    echo "[$role] $(echo "$content" | head -c 500)..." >> "$CONTEXT_DIR/recent-context.txt"

    # Keep only last 50 messages in recent context
    if [ -f "$CONTEXT_DIR/recent-context.txt" ]; then
      tail -n 50 "$CONTEXT_DIR/recent-context.txt" > "$CONTEXT_DIR/recent-context.tmp" && mv "$CONTEXT_DIR/recent-context.tmp" "$CONTEXT_DIR/recent-context.txt"
    fi
  fi
}

track_tool_call() {
  local tool_name="${1:-}"
  local input_size="${2:-0}"
  local output_size="${3:-0}"

  # Tool calls add to context: input + output
  local tokens=$(( (input_size + output_size) / 4 ))
  increment_state "estimatedTokens" "$tokens"
  increment_state "toolCallCount" 1
}

get_usage_percent() {
  init_state

  if command -v jq &>/dev/null; then
    local tokens=$(jq -r '.estimatedTokens // 0' "$STATE_FILE")
    local percent=$((tokens * 100 / MAX_CONTEXT_TOKENS))
    echo "$percent"
  else
    echo "0"
  fi
}

# =============================================================================
# THRESHOLD ACTIONS
# =============================================================================

generate_summary() {
  echo "Generating context summary..." >&2

  local state=$(get_state)
  local tokens=$(echo "$state" | jq -r '.estimatedTokens // 0')
  local messages=$(echo "$state" | jq -r '.messageCount // 0')
  local tools=$(echo "$state" | jq -r '.toolCallCount // 0')

  # Read recent context
  local recent_context=""
  if [ -f "$CONTEXT_DIR/recent-context.txt" ]; then
    recent_context=$(cat "$CONTEXT_DIR/recent-context.txt")
  fi

  # Generate summary
  cat > "$SUMMARY_FILE" << EOF
# Context Summary - $(date -Iseconds)

## Session Statistics
- Estimated tokens: $tokens / $MAX_CONTEXT_TOKENS
- Messages exchanged: $messages
- Tool calls made: $tools
- Usage: $(get_usage_percent)%

## Recent Activity
\`\`\`
$recent_context
\`\`\`

## Key Topics Discussed
(Auto-extracted from conversation)

## Important Decisions Made
- See memory namespace: decisions

## Files Modified
- Check git status for changes

## Next Steps
- Continue from this summary in new session
- Review persisted memory for full context
EOF

  update_state "summaryGenerated" "true"
  echo "$SUMMARY_FILE"
}

persist_to_memory() {
  echo "Persisting context to memory..." >&2

  local timestamp=$(date +%s)
  local session_id=$(jq -r '.sessionId // "unknown"' "$STATE_FILE")

  # Prepare handoff context
  local handoff_context=$(cat << EOF
{
  "sessionId": "$session_id",
  "timestamp": $timestamp,
  "summary": $(cat "$SUMMARY_FILE" 2>/dev/null | jq -Rs . || echo '""'),
  "state": $(get_state),
  "recentContext": $(cat "$CONTEXT_DIR/recent-context.txt" 2>/dev/null | jq -Rs . || echo '""')
}
EOF
)

  echo "$handoff_context" > "$HANDOFF_FILE"

  # Store in claude-flow memory via CLI
  if command -v npx &>/dev/null; then
    npx @claude-flow/cli@latest memory store \
      --namespace "context-handoff" \
      --key "session-$session_id-$timestamp" \
      --value "$(echo "$handoff_context" | jq -c .)" 2>/dev/null || true

    # Also store critical decisions
    npx @claude-flow/cli@latest memory store \
      --namespace "session-summaries" \
      --key "$session_id" \
      --value "$(cat "$SUMMARY_FILE" 2>/dev/null | jq -Rs .)" 2>/dev/null || true
  fi

  update_state "memoryPersisted" "true"
  echo "$HANDOFF_FILE"
}

spawn_new_session() {
  echo "Preparing new session handoff..." >&2

  local timestamp=$(date +%s)
  local old_session=$(jq -r '.sessionId // "unknown"' "$STATE_FILE")
  local new_session="session_${timestamp}"

  # Create handoff instructions
  cat > "$CONTEXT_DIR/new-session-prompt.md" << EOF
# Session Continuation

You are continuing from a previous session that reached context limits.

## Previous Session: $old_session

### Summary
$(cat "$SUMMARY_FILE" 2>/dev/null || echo "No summary available")

### How to Continue
1. Review the summary above for context
2. Check memory namespace \`context-handoff\` for full details
3. Run: \`npx @claude-flow/cli memory retrieve --namespace context-handoff --key session-$old_session-*\`
4. Continue working on the user's task

### Important
- Previous context has been summarized and stored
- Key decisions are in the \`decisions\` memory namespace
- File changes can be reviewed with \`git status\` and \`git diff\`
EOF

  # Create spawn command for new session
  cat > "$CONTEXT_DIR/spawn-command.sh" << SPAWN
#!/bin/bash
# Spawn new Claude Code session with context
export CLAUDE_CONTEXT_HANDOFF="$HANDOFF_FILE"
export CLAUDE_PREVIOUS_SESSION="$old_session"

# If using claude-flow agent spawn
npx @claude-flow/cli@latest agent spawn \\
  --type "continuation" \\
  --name "session-continuation" \\
  --prompt "\$(cat $CONTEXT_DIR/new-session-prompt.md)" \\
  2>/dev/null || echo "Manual continuation required - see $CONTEXT_DIR/new-session-prompt.md"
SPAWN
  chmod +x "$CONTEXT_DIR/spawn-command.sh"

  update_state "sessionSpawned" "true"

  echo "$CONTEXT_DIR/new-session-prompt.md"
}

# =============================================================================
# THRESHOLD CHECK - Main entry point
# =============================================================================

check_threshold() {
  init_state

  local usage=$(get_usage_percent)
  local threshold_reached=$(jq -r '.thresholdReached // false' "$STATE_FILE")

  # Warning at 80%
  if [ "$usage" -ge "$WARN_THRESHOLD" ] && [ "$usage" -lt "$THRESHOLD_PERCENT" ]; then
    cat << EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"**Context Warning**: Usage at ${usage}% (threshold: ${THRESHOLD_PERCENT}%). Consider summarizing soon."}}
EOF
    exit 0
  fi

  # Threshold reached at 90%
  if [ "$usage" -ge "$THRESHOLD_PERCENT" ] && [ "$threshold_reached" = "false" ]; then
    update_state "thresholdReached" "true"

    echo "Context threshold reached (${usage}%). Initiating handoff sequence..." >&2

    # Execute all three actions
    local summary_path=$(generate_summary)
    local memory_path=$(persist_to_memory)
    local prompt_path=$(spawn_new_session)

    # Return context for Claude
    cat << EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"**CONTEXT THRESHOLD REACHED (${usage}%)**\n\nAutomatic actions completed:\n1. Summary generated: $summary_path\n2. Context persisted to memory\n3. New session handoff prepared\n\n**Recommended Action**: Review the summary and continue in a new session for optimal performance.\n\nTo continue:\n- Start new chat session\n- Reference: \`npx @claude-flow/cli memory retrieve --namespace context-handoff\`\n- Or read: $prompt_path"}}
EOF
    exit 0
  fi

  # Already handled
  if [ "$threshold_reached" = "true" ]; then
    cat << EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"**Context at ${usage}%** - Handoff already prepared. Consider starting new session."}}
EOF
    exit 0
  fi

  # Under threshold - silent
  exit 0
}

# =============================================================================
# MANUAL CONTROLS
# =============================================================================

force_summarize() {
  generate_summary
  persist_to_memory
  spawn_new_session

  echo "Forced summarization complete. Files:"
  echo "  Summary: $SUMMARY_FILE"
  echo "  Handoff: $HANDOFF_FILE"
  echo "  New Session: $CONTEXT_DIR/new-session-prompt.md"
}

reset_tracking() {
  rm -f "$STATE_FILE" "$SUMMARY_FILE" "$HANDOFF_FILE" "$CONTEXT_DIR/recent-context.txt"
  init_state
  echo "Context tracking reset"
}

get_status() {
  init_state

  local usage=$(get_usage_percent)
  local state=$(get_state)

  if command -v jq &>/dev/null; then
    echo "$state" | jq ". + {usagePercent: $usage, threshold: $THRESHOLD_PERCENT, maxTokens: $MAX_CONTEXT_TOKENS}"
  else
    echo "{\"usagePercent\": $usage}"
  fi
}

# =============================================================================
# HOOK INTEGRATION
# =============================================================================

# Called from PostToolUse hooks
post_tool_hook() {
  local tool_name="${1:-}"
  local input="${2:-}"
  local output="${3:-}"

  # Track the tool call
  track_tool_call "$tool_name" "${#input}" "${#output}"

  # Check threshold
  check_threshold
}

# Called from UserPromptSubmit hooks
pre_prompt_hook() {
  local prompt="${1:-}"

  # Track the message
  track_message "$prompt" "user"

  # Check threshold
  check_threshold
}

# =============================================================================
# Main dispatcher
# =============================================================================

case "${1:-check}" in
  "check")
    check_threshold
    ;;
  "status")
    get_status
    ;;
  "track-message")
    track_message "${2:-}" "${3:-user}"
    ;;
  "track-tool")
    post_tool_hook "${2:-}" "${3:-}" "${4:-}"
    ;;
  "pre-prompt")
    pre_prompt_hook "${2:-}"
    ;;
  "summarize")
    force_summarize
    ;;
  "reset")
    reset_tracking
    ;;
  "usage")
    echo "$(get_usage_percent)%"
    ;;
  "help"|"-h"|"--help")
    cat << 'EOF'
Claude Flow V3 - Context Threshold Management

Monitors context usage and triggers automatic actions at 90% threshold:
- Auto-summarize conversation context
- Save important context to memory
- Spawn new session with transferred context

Usage: context-threshold.sh <command> [args]

Commands:
  check                         Check threshold and trigger actions if needed
  status                        Get current tracking status as JSON
  usage                         Get usage percentage only
  track-message <content> [role] Track a message (for manual integration)
  track-tool <name> [input] [output] Track a tool call
  pre-prompt <prompt>           Pre-prompt hook (track + check)
  summarize                     Force summarization immediately
  reset                         Reset all tracking state

Environment Variables:
  CONTEXT_THRESHOLD_PERCENT     Threshold percentage (default: 90)
  MAX_CONTEXT_TOKENS           Max context window (default: 200000)
  CONTEXT_WARN_THRESHOLD       Warning threshold (default: 80)
  SESSION_ID                   Current session identifier

Hook Integration:
  PostToolUse:    context-threshold.sh track-tool "$TOOL_NAME" "$TOOL_INPUT" "$TOOL_RESULT"
  UserPromptSubmit: context-threshold.sh pre-prompt "$PROMPT"

Files:
  .claude-flow/context/threshold-state.json  - Tracking state
  .claude-flow/context/current-summary.md    - Generated summary
  .claude-flow/context/handoff-context.json  - Handoff data
  .claude-flow/context/new-session-prompt.md - New session instructions
EOF
    ;;
  *)
    echo "Unknown command: $1" >&2
    exit 1
    ;;
esac
