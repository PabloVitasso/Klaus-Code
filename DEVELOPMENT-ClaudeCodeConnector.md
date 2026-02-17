# Claude Code Connector Documentation

This document describes the Claude Code OAuth authentication mechanism and the special `oc_` tool name prefixing workaround required for tool calling.

## Quick Navigation

**Jump to:**

- [Quick Reference](#quick-reference) - Key files, line numbers, constants
- [Architecture](#architecture) - Flow diagram
- [OAuth Authentication](#oauth-authentication) - Headers, tokens, metadata
- [Usage Tracking](#usage-tracking) - How Claude Code checks quotas and rate limits
- [Tool Name Prefixing](#tool-name-prefixing-mechanism) - Core workaround (`oc_` prefix)
- [Adding New Models](#adding-new-models) - How to add Claude models (e.g., Opus 4.6)
- [Request/Response Examples](#requestresponse-flow-examples) - Complete flows
- [Troubleshooting](#troubleshooting) - Common issues

## Quick Reference

### mitmproxy

in one window:
mitmweb --listen-host 127.0.0.1 --listen-port 58888 --web-port 8081 --web-open-browser=false

in second window
export NODE_EXTRA_CA_CERTS="/Users/$USER/.mitmproxy/mitmproxy-ca-cert.pem"
export NODE_TLS_REJECT_UNAUTHORIZED=0
export HTTP_PROXY="http://127.0.0.1:58888"
export HTTPS_PROXY="http://127.0.0.1:58888"
sudo cp ~/.mitmproxy/mitmproxy-ca-cert.pem /usr/local/share/mitmproxy-ca.pem
sudo chmod 644 /usr/local/share/mitmproxy-ca.pem
export NODE_EXTRA_CA_CERTS=/usr/local/share/mitmproxy-ca.pem

claude

in browser check the requests:
http://127.0.0.1:8081

**Parsing saved flow files (.mitm):**

```bash
pip install mitmproxy
python docs/parse-mitm-flows.py docs/2026.02.17-claude-code2.1.45.har       # summary
python docs/parse-mitm-flows.py docs/2026.02.17-claude-code2.1.45.har --json # full JSON
```

### Critical Files & Line Numbers

| File                                               | Key Lines | Purpose                                         |
| -------------------------------------------------- | --------- | ----------------------------------------------- |
| `src/integrations/claude-code/streaming-client.ts` | L10       | `TOOL_NAME_PREFIX = "oc_"` constant             |
|                                                    | L35-44    | `prefixToolName()` / `stripToolNamePrefix()`    |
|                                                    | L52-57    | `prefixToolNames()` - tools array               |
|                                                    | L63-86    | `prefixToolNamesInMessages()` - message history |
|                                                    | L92-108   | `prefixToolChoice()` - tool_choice              |
|                                                    | L644-662  | Response parsing with prefix stripping          |
| `src/api/providers/claude-code.ts`                 | L67       | `ClaudeCodeHandler` class                       |
|                                                    | L294-305  | `getModel()` - model selection                  |
|                                                    | L117-255  | `createMessage()` - API request flow            |
| `src/integrations/claude-code/oauth.ts`            | L13       | `generateUserId()` - user_id hash               |
|                                                    | L93-203   | OAuth token management                          |
| `packages/types/src/providers/claude-code.ts`      | L46-74    | Model definitions                               |
|                                                    | L86-93    | Model family patterns (normalization)           |
|                                                    | L112-136  | `normalizeClaudeCodeModelId()`                  |

### Key Constants

```typescript
TOOL_NAME_PREFIX = "oc_" // streaming-client.ts:10
CLAUDE_CODE_API_ENDPOINT = "..." // streaming-client.ts:20
claudeCodeDefaultModelId = "claude-sonnet-4-6" // claude-code.ts:78
X_STAINLESS_PACKAGE_VERSION = "0.74.0" // updated from 0.70.0 (v2.1.45)
```

### Model Support Matrix

**Current models (v2.1.45 / 2026-02-17):**

| Model             | API Model ID                | Max Tokens | Context | Reasoning                           | Status       |
| ----------------- | --------------------------- | ---------- | ------- | ----------------------------------- | ------------ |
| claude-haiku-4-5  | `claude-haiku-4-5-20251001` | 32K        | 200K    | None (no effort/thinking)           | ✅ Supported |
| claude-sonnet-4-6 | `claude-sonnet-4-6`         | 32K        | 200K    | Adaptive + effort (low/medium/high) | ✅ Default   |
| claude-opus-4-6   | `claude-opus-4-6`           | 128K       | 200K→1M | Adaptive + effort (low/medium/high) | ✅ Supported |

**Removed models** (no longer offered by Claude Code 2.1.45):

- `claude-sonnet-4-5` - removed
- `claude-opus-4-5` - removed

## Overview

The Claude Code connector (`src/api/providers/claude-code.ts`) uses OAuth authentication to access Anthropic's Claude Code API. Unlike regular Anthropic API tokens, Claude Code OAuth tokens have a strict validation requirement: **third-party tool names are rejected**.

To work around this limitation, the connector prefixes all tool names with `oc_` when sending requests to the API and strips the prefix from responses.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Claude Code Connector Flow                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌─────────────────────────┐    ┌────────────────────┐  │
│  │ Klaus Code   │───▶│ src/api/providers/      │───▶│ src/integrations/  │  │
│  │ Agent        │    │ claude-code.ts          │    │ claude-code/       │  │
│  └──────────────┘    └─────────────────────────┘    │ streaming-client.ts│  │
│                               │                     └────────────────────┘  │
│                               ▼                            │                  │
│                        ┌──────────────┐                   ▼                  │
│                        │ OAuth Token  │          Prefix tools:              │
│                        │ from         │          "read_file" →              │
│                        │ OAuth Manager│          "oc_read_file"             │
│                        └──────────────┘                                    │
│                                                          │                  │
│                                                          ▼                  │
│                                                 ┌──────────────────────┐    │
│                                                 │ Anthropic API        │    │
│                                                 │ /v1/messages         │    │
│                                                 │ (OAuth tokens)       │    │
│                                                 └──────────────────────┘    │
│                                                          │                  │
│                                                          ▼                  │
│                                                 ┌──────────────────────┐    │
│                                                 │ Strip prefix:        │    │
│                                                 │ "oc_read_file" →     │    │
│                                                 │ "read_file"          │    │
│                                                 └──────────────────────┘    │
│                                                          │                  │
│                                                          ▼                  │
│                                                 ┌──────────────────────┐    │
│                                                 │ Agent receives       │    │
│                                                 │ original tool names  │    │
│                                                 └──────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## OAuth Authentication

### OAuth Flow Components

| Component                | File                                               | Purpose                                        |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------- |
| `ClaudeCodeOAuthManager` | `src/integrations/claude-code/oauth.ts`            | Manages OAuth tokens, refresh, email retrieval |
| `ClaudeCodeHandler`      | `src/api/providers/claude-code.ts`                 | API handler using OAuth tokens                 |
| `createStreamingMessage` | `src/integrations/claude-code/streaming-client.ts` | Makes API requests with OAuth                  |

### OAuth Token Requirements

Claude Code OAuth tokens require specific metadata:

- **`user_id`**: A hash combining organization ID and email (generated in `src/integrations/claude-code/oauth.ts` via `generateUserId()`)
- **Beta headers**: Claude Code uses multiple beta features

### Required API Headers

**Updated 2026-02-17**: Headers from claude-code CLI v2.1.45 reverse engineering.

```typescript
// POST /v1/messages?beta=true  (opus-4-6/sonnet-4-6 example)
const headers: Record<string, string> = {
	// Core
	Accept: "application/json",
	Authorization: `Bearer ${accessToken}`,
	"Content-Type": "application/json",
	"anthropic-version": "2023-06-01",
	"anthropic-dangerous-direct-browser-access": "true",

	// Identity (Klaus Code uses vscode variant)
	"User-Agent": "claude-cli/2.1.45 (external, cli)", // Klaus: `klaus-code/${version} (vscode, extension)`
	"x-app": "cli", // Klaus: "vscode-extension"

	// Stainless SDK headers (v0.74.0 as of 2026-02-17, was 0.70.0)
	"X-Stainless-Lang": "js",
	"X-Stainless-Package-Version": "0.74.0",
	"X-Stainless-OS": "Linux", // or "Windows"/"MacOS"
	"X-Stainless-Arch": "x64", // or "arm64"
	"X-Stainless-Runtime": "node",
	"X-Stainless-Runtime-Version": "v22.14.0",
	"X-Stainless-Retry-Count": "0",
	"X-Stainless-Timeout": "600",

	// Browser-like headers
	"accept-language": "*",
	"sec-fetch-mode": "cors",
	"accept-encoding": "br, gzip, deflate",

	// anthropic-beta: varies by call type (see Beta Flags table below)
	"anthropic-beta": "...",
}
```

**Note on Billing/Telemetry in System Prompt:**

The official Claude Code CLI v2.1.45 injects a billing metadata entry as the FIRST system prompt block:

```json
{ "type": "text", "text": "x-anthropic-billing-header: cc_version=2.1.45.adc; cc_entrypoint=cli; cch=00000;" }
```

Klaus Code should inject the equivalent for its version (`cc_entrypoint=vscode-extension`). **This is a system prompt text entry, NOT a request header.** If Klaus Code previously had errors with this, check that it's formatted as a `type: "text"` block — NOT as an HTTP header or a different format.

## Usage Tracking

### Overview

Claude Code tracks usage and quota through a combination of:

1. Response headers containing unified rate limit information
2. A special "quota" message request to fetch current usage statistics
3. Usage data embedded in every message response

### API Endpoints for Usage

**Updated 2026-02-17 (v2.1.45):**

| Endpoint                            | Method | Purpose                                            |
| ----------------------------------- | ------ | -------------------------------------------------- |
| `/api/oauth/account/settings`       | GET    | Account settings and preferences (startup)         |
| `/api/oauth/usage`                  | GET    | **NEW** — Usage utilization by tier                |
| `/api/claude_code_grove`            | GET    | Feature flags (`grove_enabled`, `domain_excluded`) |
| `/api/oauth/claude_cli/client_data` | GET    | **NEW** — Client config data (returns `{}`)        |
| `/api/claude_code_penguin_mode`     | GET    | **NEW** — Extra usage status                       |
| `/v1/messages?beta=true`            | POST   | Message API (includes usage data)                  |

All GET requests use:

```
User-Agent: claude-code/2.1.45   (or axios/1.8.4 for penguin_mode)
anthropic-beta: oauth-2025-04-20
Accept: application/json, text/plain, */*
Accept-Encoding: gzip, compress, deflate, br
Connection: close
```

### Usage Endpoint (NEW)

**GET `/api/oauth/usage`** returns per-tier utilization — prefer this over rate limit response headers:

```json
{
	"five_hour": {
		"utilization": 0.0,
		"resets_at": "2026-02-17T21:00:00.276803+00:00"
	},
	"seven_day": {
		"utilization": 5.0,
		"resets_at": "2026-02-23T09:00:00.276824+00:00"
	},
	"seven_day_oauth_apps": null,
	"seven_day_opus": null,
	"seven_day_sonnet": null,
	"seven_day_cowork": null,
	"iguana_necktie": null,
	"extra_usage": {
		"is_enabled": false,
		"monthly_limit": null,
		"used_credits": null,
		"utilization": null
	}
}
```

### Penguin Mode Endpoint (NEW)

**GET `/api/claude_code_penguin_mode`** — extra/paid usage status:

```json
{ "enabled": false, "disabled_reason": "extra_usage_disabled" }
```

### Account Settings Endpoint

**GET `/api/oauth/account/settings`** — called at startup for user preferences. Response includes account configuration and dismissed banner IDs.

### API Endpoint

**CRITICAL**: The OAuth-authenticated endpoint requires `?beta=true` query parameter:

```
POST https://api.anthropic.com/v1/messages?beta=true
```

Without this parameter, the API returns "invalid x-api-key" error even with valid OAuth tokens.

### Beta Flags by Call Type

**Updated 2026-02-17 (claude-code v2.1.45):**

| Call Type                               | anthropic-beta                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Quota check (haiku, max_tokens=1)       | `oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05`                                             |
| Haiku (standard / structured output)    | `oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05,structured-outputs-2025-12-15`               |
| Sonnet-4-6 / Opus-4-6 messages          | `claude-code-20250219,oauth-2025-04-20,adaptive-thinking-2026-01-28,prompt-caching-scope-2026-01-05,effort-2025-11-24`         |
| `/v1/messages/count_tokens` (any model) | `claude-code-20250219,oauth-2025-04-20,adaptive-thinking-2026-01-28,prompt-caching-scope-2026-01-05,token-counting-2024-11-01` |

**Beta flag details:**

| Beta Flag                                | Purpose / Notes                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `oauth-2025-04-20`                       | Required for OAuth — present in ALL calls                                         |
| `interleaved-thinking-2025-05-14`        | Haiku thinking (old models)                                                       |
| `adaptive-thinking-2026-01-28`           | **NEW** — replaces `interleaved-thinking` for sonnet/opus-4-6                     |
| `prompt-caching-scope-2026-01-05`        | Scope-based caching — present in ALL calls (replaces `prompt-caching-2024-07-31`) |
| `effort-2025-11-24`                      | **NEW** — enables `output_config.effort` field for sonnet/opus-4-6                |
| `claude-code-20250219`                   | Required for sonnet-4-6/opus-4-6 messages AND count_tokens                        |
| `token-counting-2024-11-01`              | count_tokens endpoint only                                                        |
| `structured-outputs-2025-12-15`          | Added when using structured output (haiku)                                        |
| `prompt-caching-2024-07-31`              | **OBSOLETE** — replaced by `prompt-caching-scope-2026-01-05`                      |
| `fine-grained-tool-streaming-2025-05-14` | Not used by official CLI                                                          |

**BREAKING CHANGE from v2.1.39**: `claude-code-20250219` is now included in regular `/v1/messages` requests for sonnet-4-6 and opus-4-6 (was previously only for count_tokens).

### Klaus Code Implementation Status

**Current implementation** (`streaming-client.ts:541-555`):

```typescript
const headers: Record<string, string> = {
	Accept: "application/json", // ✅ Matches official
	Authorization: `Bearer ${accessToken}`, // ✅ Matches official
	"Content-Type": "application/json", // ✅ Matches official
	"User-Agent": CLAUDE_CODE_API_CONFIG.userAgent, // ✅ Matches format
	"Anthropic-Version": CLAUDE_CODE_API_CONFIG.version, // ✅ Matches official
	"Anthropic-Beta": betas.join(","), // ✅ Model-aware (see beta table)
	"x-app": CLAUDE_CODE_API_CONFIG.xApp, // ✅ Intentionally different
	"anthropic-dangerous-direct-browser-access": "true", // ✅ Matches official
	"accept-language": "*", // ✅ Matches official
	"sec-fetch-mode": "cors", // ✅ Matches official
	"accept-encoding": "br, gzip, deflate", // ✅ Matches official
	...CLAUDE_CODE_API_CONFIG.stainlessHeaders, // ✅ X-Stainless-Package-Version: 0.74.0
}
```

**Implementation is current as of v2.1.45 (2026-02-17):**

- `X-Stainless-Package-Version`: `0.74.0` ✅
- Beta flags are model-aware: adaptive models (`sonnet-4-6`/`opus-4-6`) get `adaptiveBetas`, others get `defaultBetas` ✅
- Uses `prompt-caching-scope-2026-01-05` (old `prompt-caching-2024-07-31` removed) ✅
- `adaptive-thinking-2026-01-28` and `effort-2025-11-24` included for 4-6 models ✅

### Quota Check Request

Claude Code sends a minimal message request to check usage quotas (uses same headers as above):

```typescript
// Quota check request body
POST /v1/messages?beta=true
{
  "model": "claude-haiku-4-5-20251001",  // Cheapest model
  "max_tokens": 1,                        // Minimal output
  "messages": [
    {
      "role": "user",
      "content": "quota"                  // Special quota keyword
    }
  ],
  "metadata": {
    "user_id": "user_{hash}_account_{uuid}_session_{uuid}"
  }
}
```

### Unified Rate Limit Headers

**Response headers from `/v1/messages` requests include:**

```typescript
// Response headers (example values)
{
  // Status indicators
  "anthropic-ratelimit-unified-status": "allowed",           // Overall status
  "anthropic-ratelimit-unified-5h-status": "allowed",        // 5-hour tier
  "anthropic-ratelimit-unified-7d-status": "allowed",        // 7-day tier
  "anthropic-ratelimit-unified-overage-status": "allowed",   // Overage tier

  // Reset timestamps (Unix epoch)
  "anthropic-ratelimit-unified-5h-reset": "1770411600",      // 5h tier reset
  "anthropic-ratelimit-unified-7d-reset": "1770624000",      // 7d tier reset
  "anthropic-ratelimit-unified-overage-reset": "1772323200", // Overage reset
  "anthropic-ratelimit-unified-reset": "1770411600",         // Next reset

  // Utilization percentages (0.0 to 1.0+)
  "anthropic-ratelimit-unified-5h-utilization": "0.0",       // 5h tier usage
  "anthropic-ratelimit-unified-7d-utilization": "0.52",      // 7d tier usage (52%)
  "anthropic-ratelimit-unified-overage-utilization": "0.0",  // Overage usage

  // Policy indicators
  "anthropic-ratelimit-unified-representative-claim": "five_hour", // Most restrictive tier
  "anthropic-ratelimit-unified-fallback-percentage": "0.5",        // Fallback threshold

  // Standard response headers
  "anthropic-organization-id": "83615e56-057b-4fba-8ae9-f2bb33880482",
  "request-id": "req_011CXs9q5frcXauixA6aPLbY",
  "Content-Type": "application/json",
  // ... other standard headers
}
```

### Usage Data in Message Responses

Every message response includes detailed token usage:

```typescript
// From SSE stream: event: message_start
{
  "type": "message_start",
  "message": {
    "model": "claude-haiku-4-5-20251001",
    "usage": {
      // Token counts
      "input_tokens": 292,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 0,
      "output_tokens": 1,

      // Prompt caching details
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 0
      },

      // Service metadata
      "service_tier": "standard",
      "inference_geo": "not_available"
    }
  }
}

// At the end: event: message_delta
{
  "type": "message_delta",
  "usage": {
    "output_tokens": 135  // Final output token count
  }
}
```

### Implementation Strategy for Klaus Code

To replicate Claude Code's usage tracking in Klaus Code:

1. **Parse rate limit headers** from every `/v1/messages` response
2. **Aggregate usage data** from `message_start` and `message_delta` events
3. **Send periodic quota checks** using the minimal "quota" message pattern
4. **Display usage information** in the UI with:
    - Current utilization percentage for each tier (5h, 7d, overage)
    - Time until next reset
    - Representative claim (which tier is limiting)
    - Token counts (input, cached, output)

**Example Usage Display:**

```
Rate Limits (5h tier active):
├─ 5-hour:   0.0% used (resets in 4h 23m)
├─ 7-day:    52% used (resets in 2d 14h)
└─ Overage:  0.0% used

Current Request:
├─ Input:    292 tokens
├─ Cached:   0 created, 0 read
└─ Output:   135 tokens
```

### Key Implementation Files

For Klaus Code implementation:

- `src/integrations/claude-code/streaming-client.ts` - Add header parsing
- `src/api/providers/claude-code.ts` - Aggregate usage statistics
- `webview-ui/src/components/` - Display usage in UI

## Tool Name Prefixing Mechanism

### Why Prefix Is Needed

Anthropic's Claude Code OAuth validation rejects tool names that don't belong to Claude Code's official toolset. Klaus Code's custom tools (like `read_file`, `write_to_file`, etc.) would fail validation.

### Prefix Constants

```typescript
// src/integrations/claude-code/streaming-client.ts:10
const TOOL_NAME_PREFIX = "oc_"
```

### Prefix/Suffix Functions

```typescript
// Add prefix to tool names
export function prefixToolName(name: string): string {
	return `${TOOL_NAME_PREFIX}${name}` // "read_file" → "oc_read_file"
}

// Remove prefix from tool names
export function stripToolNamePrefix(name: string): string {
	if (name.startsWith(TOOL_NAME_PREFIX)) {
		return name.slice(TOOL_NAME_PREFIX.length) // "oc_read_file" → "read_file"
	}
	return name
}
```

### Where Prefix Is Applied

1. **Tools array in request body** (`src/integrations/claude-code/streaming-client.ts:52-57`):

    ```typescript
    function prefixToolNames(tools: Anthropic.Messages.Tool[]): Anthropic.Messages.Tool[] {
    	return tools.map((tool) => ({
    		...tool,
    		name: prefixToolName(tool.name),
    	}))
    }
    ```

2. **tool_choice when type is "tool"** (`src/integrations/claude-code/streaming-client.ts:92-108`):

    ```typescript
    function prefixToolChoice(toolChoice): Anthropic.Messages.ToolChoice | undefined {
    	if (toolChoice.type === "tool" && "name" in toolChoice) {
    		return { ...toolChoice, name: prefixToolName(toolChoice.name) }
    	}
    	return toolChoice
    }
    ```

3. **tool_use blocks in messages** (`src/integrations/claude-code/streaming-client.ts:63-86`):
    ```typescript
    function prefixToolNamesInMessages(messages: Anthropic.Messages.MessageParam[]) {
    	return messages.map((message) => {
    		const prefixedContent = message.content.map((block) => {
    			if (block.type === "tool_use") {
    				return { ...block, name: prefixToolName(block.name) }
    			}
    			return block
    		})
    		return { ...message, content: prefixedContent }
    	})
    }
    ```

### Where Prefix Is Stripped

**Response parsing** (`src/integrations/claude-code/streaming-client.ts:644-662`):

```typescript
case "tool_use": {
    const originalName = stripToolNamePrefix(contentBlock.name as string)
    contentBlocks.set(index, {
        type: "tool_use",
        text: "",
        id: contentBlock.id as string,
        name: originalName,  // Stripped name for internal use
        arguments: "",
    })
    yield {
        type: "tool_call_partial",
        index,
        id: contentBlock.id as string,
        name: originalName,  // Original name exposed to agent
        arguments: undefined,
    }
    break
}
```

## Adding New Models

### Process for Adding Claude Models

**File to modify**: `packages/types/src/providers/claude-code.ts`

**Steps**:

1. **Add model definition** to `claudeCodeModels` object (L46-74):

    ```typescript
    // For haiku (no thinking/effort):
    "claude-haiku-4-5-20251001": {
        maxTokens: 32_000,
        contextWindow: 200_000,
        supportsImages: true,
        supportsPromptCache: true,
        supportsReasoningBudget: false,
        supportsReasoningEffort: false,
        description: "Claude Haiku 4.5 - Fast and lightweight",
    }

    // For sonnet/opus with adaptive thinking + effort:
    "claude-sonnet-4-6": {
        maxTokens: 32_000,
        contextWindow: 200_000,
        supportsImages: true,
        supportsPromptCache: true,
        supportsReasoningBudget: false,  // uses adaptive, not budget
        supportsReasoningEffort: ["low", "medium", "high"],  // no "disable"
        reasoningEffort: "low",           // default
        description: "Claude Sonnet 4.6 - Balanced performance",
    }
    ```

2. **Update model family patterns** (L86-93) for normalization:

    ```typescript
    { pattern: /sonnet.*4[._-]?6/i, target: "claude-sonnet-4-6" },
    { pattern: /opus.*4[._-]?6/i, target: "claude-opus-4-6" },
    ```

3. **Update JSDoc examples** (L96-103) to document the mapping.

4. **Test**:
    ```bash
    pnpm check-types                    # Verify TypeScript
    cd src && npx vitest run api/providers/__tests__/claude-code.spec.ts
    pnpm vsix                           # Build extension
    code --install-extension bin/klaus-code-*.vsix --force
    ```

**Model string is passed directly to API** - no additional logic needed in `streaming-client.ts`.

### Reasoning API: Adaptive Thinking (NEW v2.1.45)

**BREAKING CHANGE**: 4-6 models no longer use `budget_tokens`. Instead:

```json
// v2.1.45 API body (sonnet-4-6 / opus-4-6):
{
	"model": "claude-sonnet-4-6",
	"max_tokens": 32000,
	"thinking": { "type": "adaptive" },
	"output_config": { "effort": "low" },
	"stream": true
}
```

| Field                  | Value                           | Notes                                     |
| ---------------------- | ------------------------------- | ----------------------------------------- |
| `thinking.type`        | `"adaptive"`                    | Replaces `"enabled"` with `budget_tokens` |
| `output_config.effort` | `"low"` / `"medium"` / `"high"` | Replaces top-level `"effort"` field       |

**Haiku** does NOT send `thinking` or `output_config` at all.

### Capabilities Reference

- `supportsImages`: Image input support
- `supportsPromptCache`: Prompt caching support
- `supportsReasoningBudget`: Budget-based thinking (old models, `false` for 4-6)
- `supportsReasoningEffort`: Adaptive effort levels (`["low","medium","high"]`) or `false`

### Model Selection Flow

```
User selects model → getModel() retrieves definition → Model ID passed to streaming-client.ts → API request with model string
```

The Claude Code API handles model capabilities automatically - no special provider-side logic required.

### Reference: Opus 4.6 Implementation in Other Providers

See commit `47bba1c2f` for complete implementation details.

**Model definitions**:

- `packages/types/src/providers/anthropic.ts:52-72` - Anthropic Opus 4.6 with tiered pricing
- `packages/types/src/providers/bedrock.ts:+27` - Bedrock model ID: `anthropic.claude-opus-4-6-v1:0`
- `packages/types/src/providers/vertex.ts:+27` - Vertex Opus 4.6 with 1M context tiers
- `packages/types/src/providers/openrouter.ts:+6` - OpenRouter reasoning budget sets
- `packages/types/src/providers/vercel-ai-gateway.ts:+4` - Vercel capability sets

**Provider implementations**:

- `src/api/providers/anthropic.ts:68-76,334-342` - 1M context beta flag handling
- `src/api/providers/bedrock.ts:+13` - Tier pricing for 1M context
- `src/api/providers/fetchers/openrouter.ts:+10` - maxTokens overrides

**UI changes**:

- `webview-ui/src/components/settings/providers/Anthropic.tsx:+4` - 1M context checkbox
- `webview-ui/src/components/settings/providers/Bedrock.tsx:+2` - Bedrock UI updates
- `webview-ui/src/components/settings/providers/Vertex.tsx:+2` - Vertex UI updates
- `webview-ui/src/components/ui/hooks/useSelectedModel.ts:+29` - Model selection logic

**Key differences from other providers**:

- Claude Code: No pricing tiers (subscription-based)
- Claude Code: No 1M context beta flag UI (handled automatically)
- Claude Code: Simpler model definition (no cost fields)

## Request/Response Flow Examples

### Example 1: Tool Definition Request

**Internal tool definition (before prefixing):**

```typescript
{
    type: "function",
    function: {
        name: "read_file",
        description: "Read the contents of a file",
        parameters: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to file" }
            },
            required: ["path"]
        }
    }
}
```

**After prefixing (sent to API):**

```typescript
{
    name: "oc_read_file",  // Prefixed!
    description: "Read the contents of a file",
    input_schema: {
        type: "object",
        properties: {
            path: { type: "string", description: "Path to file" }
        },
        required: ["path"]
    }
}
```

### Example 2: Tool Use Request (Tool Calling)

**Agent wants to call `read_file`:**

Request to API contains tool_use block with prefixed name:

```typescript
{
    role: "assistant",
    content: [
        {
            type: "tool_use",
            id: "tooluse_123",
            name: "oc_read_file",  // Prefixed!
            input: { path: "/tmp/test.txt" }
        }
    ]
}
```

API response with tool result:

```typescript
{
    role: "user",
    content: [
        {
            type: "tool_result",
            tool_use_id: "tooluse_123",
            content: "Hello, World!"
        }
    ]
}
```

### Example 3: Complete Tool Calling Flow

```
Step 1: Agent decides to call read_file
        ↓
Step 2: Tool sent to API (prefixed)
        POST /v1/messages
        {
            "tools": [
                {
                    "name": "oc_read_file",
                    "description": "Read file contents",
                    "input_schema": { ... }
                }
            ]
        }
        ↓
Step 3: API responds with tool_use (prefixed)
        {
            "content": [
                {
                    "type": "tool_use",
                    "id": "abc123",
                    "name": "oc_read_file",
                    "input": { "path": "/etc/passwd" }
                }
            ]
        }
        ↓
Step 4: Klaus Code strips prefix before yielding to agent
        yield {
            type: "tool_call_partial",
            index: 0,
            id: "abc123",
            name: "read_file",  // Original name!
            arguments: undefined
        }
        ↓
Step 5: Agent executes tool (using original name)
        Agent calls read_file({ path: "/etc/passwd" })
        ↓
Step 6: Result sent back to API (in conversation history)
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "abc123",
                    "content": "root:x:0:0:root:/root:..."
                }
            ]
        }
        ↓
Step 7: On next request, tool_use name is prefixed again
        // prefixToolNamesInMessages() adds "oc_" prefix back
```

### Example 4: tool_choice Request

**When agent specifies a specific tool:**

```typescript
// Internal (before prefixing)
{
    type: "tool",
    name: "read_file",
    disable_parallel_tool_use: true
}

// After prefixing (sent to API)
{
    type: "tool",
    name: "oc_read_file",  // Prefixed!
    disable_parallel_tool_use: true
}
```

## Important: Message History Handling

When conversation history is passed back to the API, **tool_use names must be re-prefixed**. This is handled by `prefixToolNamesInMessages()`:

```typescript
// src/integrations/claude-code/streaming-client.ts:63-86
function prefixToolNamesInMessages(messages: Anthropic.Messages.MessageParam[]) {
	return messages.map((message) => {
		const prefixedContent = message.content.map((block) => {
			if (block.type === "tool_use") {
				return {
					...block,
					name: prefixToolName(block.name), // Re-prefix!
				}
			}
			return block
		})
		return { ...message, content: prefixedContent }
	})
}
```

This ensures that when messages containing tool_use blocks are sent back to the API:

- Tool definitions have `oc_` prefix
- Tool calls in message history have `oc_` prefix
- tool*choice has `oc*` prefix

## Files Involved

| File                                                              | Role                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/api/providers/claude-code.ts`                                | Main API handler, calls `convertOpenAIToolsToAnthropic()`            |
| `src/core/prompts/tools/native-tools/converters.ts`               | Converts OpenAI tool format to Anthropic (preserves names)           |
| `src/integrations/claude-code/streaming-client.ts`                | **Prefixes tools, makes API requests, strips prefix from responses** |
| `src/integrations/claude-code/oauth.ts`                           | Manages OAuth tokens and user_id generation                          |
| `src/integrations/claude-code/__tests__/streaming-client.spec.ts` | Tests for prefixing logic                                            |

## Key Implementation Details

### ClaudeCodeHandler.createMessage()

```typescript
// src/api/providers/claude-code.ts:117-148
async *createMessage(systemPrompt, messages, metadata?) {
    const anthropicTools = convertOpenIToolsToAnthropic(metadata?.tools ?? [])
    // Tools are in OpenAI format here, names are unchanged

    const stream = createStreamingMessage({
        // ...
        tools: anthropicTools,  // Passed to streaming-client
        // ...
    })
    // ...
}
```

### createStreamingMessage() Request Building

```typescript
// src/integrations/claude-code/streaming-client.ts:507-516
if (tools && tools.length > 0) {
	// Prefix tool names for API
	body.tools = prefixToolNames(tools)
	body.tool_choice = prefixToolChoice(toolChoice) || { type: "auto" }
}
```

### Response Parsing with Prefix Stripping

```typescript
// src/integrations/claude-code/streaming-client.ts:644-662
case "tool_use": {
    // Strip prefix so agent sees original name
    const originalName = stripToolNamePrefix(contentBlock.name as string)
    yield {
        type: "tool_call_partial",
        name: originalName,  // "read_file", not "oc_read_file"
        // ...
    }
}
```

## MCP Tools Special Handling

MCP tools use a special naming convention: `mcp--{server}--{tool}` with hyphens encoded as `___`.

Example: `mcp--atlassian--jira_search`

**These are NOT prefixed with `oc_`** because MCP tool handling is done before reaching the Claude Code connector. MCP tool names are validated by Anthropic for Claude Code OAuth tokens.

## Troubleshooting

### "invalid x-api-key" Error

**Symptom**: API returns "invalid x-api-key" error despite valid OAuth token

**Cause**: Missing `?beta=true` query parameter in endpoint URL

**Solution**: Ensure endpoint is `https://api.anthropic.com/v1/messages?beta=true` (not just `/v1/messages`)

**Why**: The OAuth-authenticated endpoint requires the beta query parameter. Without it, the API falls back to x-api-key authentication and rejects the request.

### Tool Validation Errors

If you see errors like "unknown tool" or validation failures:

1. Check that `prefixToolName()` is being called on tools
2. Check that `stripToolNamePrefix()` is being called on responses
3. Verify `TOOL_NAME_PREFIX = "oc_"` is defined

### Conversation History Issues

If tool calls fail on subsequent turns:

1. Check that `prefixToolNamesInMessages()` is re-prefixing tool_use blocks
2. Verify message history isn't being modified between requests

### OAuth Errors

If OAuth fails:

1. Check `user_id` generation in `generateUserId()`
2. Verify OAuth token is valid and not expired
3. Ensure all required beta headers are set

### Wrong Default Model for Claude Code Provider

**Symptom**: Tests or webview show `claude-sonnet-4-5` as default for claude-code provider instead of `claude-sonnet-4-6`

**Cause**: `getProviderDefaultModelId("claude-code")` in `packages/types/src/providers/index.ts` was missing an explicit `case "claude-code":` and fell through to `anthropicDefaultModelId`.

**Status**: Fixed. `packages/types/src/providers/index.ts` now has `case "claude-code": return claudeCodeDefaultModelId`.

### Stale Types Build Causes Test Failures After Model Changes

**Symptom**: Tests in `src/` or `webview-ui/` fail with outdated model IDs after editing `packages/types/src/providers/claude-code.ts`

**Cause**: These packages import the compiled dist of `@klaus-code/types`, not source. Vitest does not recompile on source changes.

**Solution**:

```bash
pnpm --filter @klaus-code/types build  # Rebuild types dist
pnpm test                              # Now picks up new model IDs
```

## See Also

- `DEVELOPMENT.md` - Main development documentation, merge procedures
- `src/integrations/claude-code/streaming-client.ts` - Source of truth for prefixing logic
- `src/api/providers/claude-code.ts` - Main connector implementation
- `packages/types/src/providers/claude-code.ts` - Model definitions and normalization
