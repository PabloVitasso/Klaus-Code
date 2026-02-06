# Claude Code Quota Check Implementation

## Summary

Successfully implemented quota/usage checking for Klaus Code's Claude Code connector, matching the official Claude Code CLI behavior.

## Changes Made

### 1. Type Definitions (`packages/types/src/providers/claude-code.ts`)

**Updated `ClaudeCodeRateLimitInfo` interface:**

```typescript
overage?: {
    status: string
    utilization: number        // NEW: Added utilization tracking
    resetTime: number          // NEW: Added reset timestamp
    disabledReason?: string
}
```

### 2. Backend (`src/integrations/claude-code/streaming-client.ts`)

#### A. Updated Beta Flags to Match Official CLI

**Before (Klaus Code specific):**

```typescript
defaultBetas: [
	"prompt-caching-2024-07-31", // Old caching beta
	"claude-code-20250219", // Unknown purpose
	"oauth-2025-04-20",
	"interleaved-thinking-2025-05-14",
	"fine-grained-tool-streaming-2025-05-14", // Klaus Code specific
]
```

**After (matches official CLI):**

```typescript
defaultBetas: [
	"oauth-2025-04-20",
	"interleaved-thinking-2025-05-14",
	"prompt-caching-scope-2026-01-05", // New scope-based caching
]
```

#### B. Added Missing Stainless Headers

```typescript
stainlessHeaders: {
    "X-Stainless-Retry-Count": "0",     // NEW
    "X-Stainless-Timeout": "600",       // NEW
    // ... other headers
}
```

#### C. Fixed Quota Request Model Name

```typescript
// Before
model: "claude-haiku-4-5"

// After (matches official CLI)
model: "claude-haiku-4-5-20251001"
```

#### D. Removed System Prompt from Quota Request

```typescript
// Before
{
    model: "claude-haiku-4-5",
    max_tokens: 1,
    system: [...],  // ❌ Not used by official CLI
    messages: [...]
}

// After (matches official CLI)
{
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1,
    messages: [{ role: "user", content: "quota" }]
}
```

#### E. Updated Rate Limit Parsing

```typescript
overage: {
    status: getHeader("anthropic-ratelimit-unified-overage-status") || "unknown",
    utilization: parseFloat(getHeader("anthropic-ratelimit-unified-overage-utilization")),  // NEW
    resetTime: parseInt(getHeader("anthropic-ratelimit-unified-overage-reset")),           // NEW
    disabledReason: getHeader("anthropic-ratelimit-unified-overage-disabled-reason") || undefined,
}
```

### 3. UI (`webview-ui/src/components/settings/providers/ClaudeCodeRateLimitDashboard.tsx`)

**Added three usage bars:**

1. **5 Hour Usage** - Primary rate limit (5-hour window)
2. **Weekly Usage** - Secondary rate limit (7-day window)
3. **Extra Usage** - Overage tier for additional capacity

**Features:**

- Color-coded progress bars (green → yellow @ 70% → red @ 90%)
- Real-time countdown to reset time
- Representative claim indicator (shows which tier is limiting)
- Overage disabled reason (if applicable)

## Request Headers Comparison

| Header                    | Official CLI                            | Klaus Code         | Status   |
| ------------------------- | --------------------------------------- | ------------------ | -------- |
| `Accept`                  | `application/json`                      | `application/json` | ✅ Match |
| `X-Stainless-Retry-Count` | `0`                                     | `0`                | ✅ Match |
| `X-Stainless-Timeout`     | `600`                                   | `600`              | ✅ Match |
| `anthropic-beta`          | `oauth...,thinking...,caching-scope...` | Same               | ✅ Match |

## Testing

### 1. Type Checking

```bash
pnpm check-types
# Result: ✅ All 14 packages passed
```

### 2. Manual Testing

1. **Open Klaus Code Settings** → Claude Code provider
2. **Sign in to Claude Code** (OAuth flow)
3. **Observe Usage Limits section** - Should show:
    - 5 Hour Usage bar with percentage and reset time
    - Weekly Usage bar with percentage and reset time
    - Extra Usage bar (if available)
    - "Currently limited by" indicator

### 3. Verify Quota Request

To inspect the actual API request:

```bash
# Set up mitmproxy (optional, for debugging)
mitmweb --listen-host 127.0.0.1 --listen-port 58888

# In VS Code, trigger quota check by opening settings
```

**Expected request:**

```http
POST /v1/messages?beta=true HTTP/1.1
Host: api.anthropic.com
Authorization: Bearer {oauth_token}
Anthropic-Version: 2023-06-01
Anthropic-Beta: oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05
X-Stainless-Retry-Count: 0
X-Stainless-Timeout: 600

{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 1,
  "messages": [{"role": "user", "content": "quota"}],
  "metadata": {"user_id": "user_{hash}_account_{uuid}_session_{uuid}"}
}
```

**Expected response headers:**

```
anthropic-ratelimit-unified-5h-status: allowed
anthropic-ratelimit-unified-5h-utilization: 0.0
anthropic-ratelimit-unified-5h-reset: 1770411600
anthropic-ratelimit-unified-7d-status: allowed
anthropic-ratelimit-unified-7d-utilization: 0.52
anthropic-ratelimit-unified-7d-reset: 1770624000
anthropic-ratelimit-unified-overage-status: allowed
anthropic-ratelimit-unified-overage-utilization: 0.0
anthropic-ratelimit-unified-overage-reset: 1772323200
anthropic-ratelimit-unified-representative-claim: five_hour
```

## Files Modified

1. `packages/types/src/providers/claude-code.ts` - Type definitions
2. `src/integrations/claude-code/streaming-client.ts` - Quota check implementation
3. `src/integrations/claude-code/streaming-client.original.ts` - Backup file (same changes)
4. `webview-ui/src/components/settings/providers/ClaudeCodeRateLimitDashboard.tsx` - UI component

## Documentation Updated

See `DEVELOPMENT-ClaudeCodeConnector.md` sections:

- Usage Tracking (complete API documentation)
- Normal Message Request Headers (header comparison)
- Klaus Code Implementation Status (discrepancy analysis)

## Compliance with Official CLI

✅ **Headers**: Match official claude-cli/2.1.34
✅ **Beta flags**: Match official CLI
✅ **Model name**: claude-haiku-4-5-20251001
✅ **Request format**: Minimal "quota" message
✅ **Rate limit parsing**: All unified headers

## Next Steps

1. **Test in production** with real Claude Code OAuth account
2. **Verify rate limit updates** during actual usage
3. **Monitor for API changes** in future Claude CLI versions
4. **Consider caching quota data** to reduce API calls (official CLI caches for ~30 seconds)
