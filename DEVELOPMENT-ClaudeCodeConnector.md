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
claudeCodeDefaultModelId = "claude-sonnet-4-5" // claude-code.ts:78
```

### Model Support Matrix

| Model             | Max Tokens | Context | Reasoning       | Status                  |
| ----------------- | ---------- | ------- | --------------- | ----------------------- |
| claude-haiku-4-5  | 32K        | 200K    | Effort + Budget | ✅ Supported            |
| claude-sonnet-4-5 | 32K        | 200K    | Effort + Budget | ✅ Supported (default)  |
| claude-opus-4-5   | 32K        | 200K    | Effort + Budget | ✅ Supported            |
| claude-opus-4-6   | 128K       | 200K→1M | Effort + Budget | ✅ Supported (v3.47.2+) |

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

**Updated 2026-01-25**: Headers now match official Claude Code CLI exactly based on reverse engineering analysis.

```typescript
const headers: Record<string, string> = {
	Accept: "application/json",
	Authorization: `Bearer ${accessToken}`,
	"Content-Type": "application/json",
	"User-Agent": `klaus-code/${Package.version} (vscode, extension)`,
	"Anthropic-Version": "2023-06-01",
	"Anthropic-Beta": "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14",
	"x-app": "vscode-extension",
	"anthropic-dangerous-direct-browser-access": "true",
	"accept-language": "*",
	"sec-fetch-mode": "cors",
	"accept-encoding": "br, gzip, deflate",
	// Stainless SDK headers (emulating official CLI)
	"X-Stainless-Lang": "js",
	"X-Stainless-Package-Version": "0.70.0",
	"X-Stainless-OS": "Linux", // or "Windows"/"MacOS"
	"X-Stainless-Arch": "x64", // or "arm64"
	"X-Stainless-Runtime": "node",
	"X-Stainless-Runtime-Version": "v22.14.0",
}
```

**Key Changes from Previous Version:**

- Changed User-Agent to match `klaus-code/{version} (vscode, extension)` format
- Added `x-app: vscode-extension` for application identification
- Added `anthropic-dangerous-direct-browser-access: true` for OAuth flows
- Added X-Stainless-\* headers to emulate official Claude Code CLI SDK
- Changed Accept from `text/event-stream` to `application/json`
- Kept `prompt-caching-2024-07-31` and `fine-grained-tool-streaming-2025-05-14` betas (NOT used by official CLI, but enabled for Klaus Code's prompt caching and tool streaming functionality)

**Note on Billing Headers:**

`x-anthropic-billing-header` is a reserved keyword in Anthropic's API and cannot be used in system prompts. Previous attempts to include billing metadata in system prompts will result in API errors. Billing/usage tracking is handled automatically by the API based on OAuth token and request headers.

## Usage Tracking

### Overview

Claude Code tracks usage and quota through a combination of:

1. Response headers containing unified rate limit information
2. A special "quota" message request to fetch current usage statistics
3. Usage data embedded in every message response

### API Endpoints for Usage

**Discovered from reverse engineering (2026-02-06):**

| Endpoint                      | Method | Purpose                                |
| ----------------------------- | ------ | -------------------------------------- |
| `/api/oauth/account/settings` | GET    | Fetch account settings and preferences |
| `/api/claude_code_grove`      | GET    | Unknown (possibly feature flags)       |
| `/v1/messages?beta=true`      | POST   | Message API (includes usage data)      |

### Account Settings Endpoint

**Request:**

```typescript
GET /api/oauth/account/settings
Host: api.anthropic.com

Headers:
  Accept: application/json, text/plain, */*
  Authorization: Bearer {oauth_token}
  anthropic-beta: oauth-2025-04-20
  User-Agent: claude-code/2.1.34
  Accept-Encoding: gzip, compress, deflate, br
  Connection: close
```

**Response Headers:**

```typescript
{
  "Content-Type": "application/json",
  "anthropic-organization-id": "{org_uuid}",
  "request-id": "req_...",
  "Content-Encoding": "gzip",
  // Standard security headers...
}
```

This endpoint is called at startup to fetch user preferences and account configuration. Klaus Code should implement this to maintain feature parity with official Claude Code.

### API Endpoint

**CRITICAL**: The OAuth-authenticated endpoint requires `?beta=true` query parameter:

```
POST https://api.anthropic.com/v1/messages?beta=true
```

Without this parameter, the API returns "invalid x-api-key" error even with valid OAuth tokens.

### Normal Message Request Headers

**Complete headers from official Claude Code CLI (claude-cli/2.1.34):**

```typescript
// POST /v1/messages?beta=true HTTP/1.1
const headers = {
	// Core request headers
	host: "api.anthropic.com",
	connection: "keep-alive",
	Accept: "application/json",

	// Stainless SDK headers (Anthropic's official TypeScript SDK)
	"X-Stainless-Retry-Count": "0",
	"X-Stainless-Timeout": "600",
	"X-Stainless-Lang": "js",
	"X-Stainless-Package-Version": "0.70.0",
	"X-Stainless-OS": "Linux", // or "Windows"/"MacOS"
	"X-Stainless-Arch": "x64", // or "arm64"
	"X-Stainless-Runtime": "node",
	"X-Stainless-Runtime-Version": "v22.14.0",

	// Anthropic API headers
	"anthropic-dangerous-direct-browser-access": "true",
	"anthropic-version": "2023-06-01",
	authorization: `Bearer ${oauthToken}`, // OAuth token
	"x-app": "cli", // "vscode-extension" for Klaus Code
	"User-Agent": "claude-cli/2.1.34 (external, cli)",
	"content-type": "application/json",

	// Beta feature flags
	"anthropic-beta": "oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05",

	// Browser-like headers (required for CORS)
	"accept-language": "*",
	"sec-fetch-mode": "cors",
	"accept-encoding": "br, gzip, deflate",

	// Content length (dynamic based on request body)
	"content-length": "284", // Varies by request
}
```

**Key differences from previously documented headers:**

1. **Connection**: `keep-alive` (not `close`) for persistent connections
2. **Accept**: `application/json` (streaming-client.ts should match this)
3. **Beta flags**: Includes `prompt-caching-scope-2026-01-05` (new caching beta)
4. **No `accept: text/event-stream`**: Official CLI uses `application/json` even for streaming

**Klaus Code should use these exact headers** to match official behavior, except:

- `x-app: "vscode-extension"` instead of `"cli"`
- `User-Agent: "klaus-code/{version} (vscode, extension)"`

### Klaus Code Implementation Status

**Current implementation** (`streaming-client.ts:541-555`):

```typescript
const headers: Record<string, string> = {
	Accept: "application/json", // ✅ Matches official
	Authorization: `Bearer ${accessToken}`, // ✅ Matches official
	"Content-Type": "application/json", // ✅ Matches official
	"User-Agent": CLAUDE_CODE_API_CONFIG.userAgent, // ✅ Matches format
	"Anthropic-Version": CLAUDE_CODE_API_CONFIG.version, // ✅ Matches official
	"Anthropic-Beta": betas.join(","), // ⚠️ Partial match (see below)
	"x-app": CLAUDE_CODE_API_CONFIG.xApp, // ✅ Intentionally different
	"anthropic-dangerous-direct-browser-access": "true", // ✅ Matches official
	"accept-language": "*", // ✅ Matches official
	"sec-fetch-mode": "cors", // ✅ Matches official
	"accept-encoding": "br, gzip, deflate", // ✅ Matches official
	...CLAUDE_CODE_API_CONFIG.stainlessHeaders, // ⚠️ Partial match (see below)
}
```

**Beta flags comparison (2.1.39 analysis):**

| Beta Flag                                | `/v1/messages` | `/v1/messages/count_tokens` | Notes                                         |
| ---------------------------------------- | -------------- | --------------------------- | --------------------------------------------- |
| `oauth-2025-04-20`                       | ✅             | ✅                          | Required for OAuth                            |
| `interleaved-thinking-2025-05-14`        | ✅             | ✅                          | Required for extended thinking                |
| `prompt-caching-scope-2026-01-05`        | ✅             | ✅                          | New scope-based caching (replaces 2024-07-31) |
| `claude-code-20250219`                   | ❌             | ✅                          | **ONLY for count_tokens endpoint**            |
| `token-counting-2024-11-01`              | ❌             | ✅                          | Token counting beta                           |
| `structured-outputs-2025-12-15`          | Optional       | ❌                          | Added when using structured output            |
| `prompt-caching-2024-07-31`              | ❌             | ❌                          | Old caching (replaced by scope-2026-01-05)    |
| `fine-grained-tool-streaming-2025-05-14` | ❌             | ❌                          | Not used by official CLI                      |

**CRITICAL**: `claude-code-20250219` should **NOT** be included in regular `/v1/messages` requests. It's only for the `/v1/messages/count_tokens` endpoint.

**Missing Stainless headers:**

| Header                    | Official CLI | Klaus Code |
| ------------------------- | ------------ | ---------- |
| `X-Stainless-Retry-Count` | `0`          | ❌         |
| `X-Stainless-Timeout`     | `600`        | ❌         |

**Recommendations:**

1. **Add missing Stainless headers** for better compatibility:

    ```typescript
    stainlessHeaders: {
        "X-Stainless-Lang": "js",
        "X-Stainless-Package-Version": "0.70.0",
        "X-Stainless-Retry-Count": "0",      // ADD THIS
        "X-Stainless-Timeout": "600",        // ADD THIS
        // ... rest of headers
    }
    ```

2. **Consider updating beta flags** to match official CLI:

    - Replace `prompt-caching-2024-07-31` with `prompt-caching-scope-2026-01-05`
    - Evaluate if `claude-code-20250219` is still needed
    - Keep `fine-grained-tool-streaming-2025-05-14` for Klaus Code functionality

3. **Test with official beta flags** to verify API compatibility

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

### Process for Adding Claude Models (Example: Opus 4.6)

**File to modify**: `packages/types/src/providers/claude-code.ts`

**Steps**:

1. **Add model definition** to `claudeCodeModels` object (L46-74):

    ```typescript
    "claude-opus-4-6": {
        maxTokens: 128_000,              // From Anthropic docs
        contextWindow: 200_000,          // Base context (1M with beta flag)
        supportsImages: true,
        supportsPromptCache: true,
        supportsReasoningBudget: true,   // New in 4.6
        supportsReasoningEffort: ["disable", "low", "medium", "high"],
        reasoningEffort: "medium",
        description: "Claude Opus 4.6 - Most capable with extended output",
    }
    ```

2. **Update model family patterns** (L86-93) for normalization:

    ```typescript
    // Add specific pattern BEFORE generic pattern:
    { pattern: /opus.*4[._-]?6/i, target: "claude-opus-4-6" },  // NEW
    { pattern: /opus/i, target: "claude-opus-4-5" },             // Existing
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

### Capabilities Reference

- `supportsImages`: Image input support
- `supportsPromptCache`: Prompt caching support
- `supportsReasoningBudget`: Budget-based reasoning (Opus 4.6+)
- `supportsReasoningEffort`: Effort levels (disable/low/medium/high)

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

## Session Learnings

### 2026-02-11: Critical Provider Factory Bug

**Issue**: "invalid x-api-key" error when using Claude Code OAuth tokens - even with correct OAuth token and headers

**Root Cause**: **ClaudeCodeHandler was not registered in the provider factory**

The `buildApiHandler()` function in `src/api/index.ts` was missing the case for `"claude-code"`, causing it to fall back to `AnthropicHandler` which requires an API key instead of OAuth.

**Files Fixed**:

1. `src/api/providers/index.ts` - Added `ClaudeCodeHandler` export
2. `src/api/index.ts` - Added import and switch case:
    ```typescript
    case "claude-code":
        return new ClaudeCodeHandler(options)
    ```

**How to Prevent**: After upstream merges, verify:

```bash
# Check provider is exported
grep "ClaudeCodeHandler" src/api/providers/index.ts

# Check provider factory has the case
grep -A 1 'case "claude-code"' src/api/index.ts
```

This was the **most critical bug** - the provider was literally never being instantiated!

### 2026-02-11: OAuth Endpoint and Header Fixes

**Issue**: Additional "invalid x-api-key" errors related to endpoint and headers

**Root Causes Discovered**:

1. **Missing `?beta=true` query parameter**:

    - Klaus Code was using: `https://api.anthropic.com/v1/messages`
    - Official CLI uses: `https://api.anthropic.com/v1/messages?beta=true`
    - Without `?beta=true`, API falls back to x-api-key auth and rejects OAuth tokens

2. **Incorrect beta headers**:
    - Klaus Code was including `claude-code-20250219` in all /v1/messages requests
    - Official CLI **ONLY** uses `claude-code-20250219` for `/v1/messages/count_tokens`
    - Regular messages use: `oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05`

**Analysis Method**:

```bash
# Captured official Claude Code CLI (2.1.39) traffic
mitmweb --listen-host 127.0.0.1 --listen-port 58888

# Analyzed HAR file
strings docs/2026.02.11-claude-code-flows.2.1.39-BIG.har | grep -E "(path|anthropic-beta)"
```

**Files Updated**:

- `src/integrations/claude-code/streaming-client.ts:245` - Added `?beta=true` to endpoint
- `src/integrations/claude-code/streaming-client.ts:250-256` - Removed `claude-code-20250219` from defaultBetas
- `src/integrations/claude-code/streaming-client.ts:267` - Updated Stainless version to 0.73.0

### 2026-02-06: Upstream Merge and Usage Tracking

### Upstream Merge Process Validation

**Verified safe merges**:

- ✅ Claude Code OAuth provider preserved through upstream merges
- ✅ Tool name prefixing (`oc_` prefix) intact after merge
- ✅ Branding script (`scripts/merge-upstream-fix-branding.sh`) handles `package.metadata.json`
- ✅ New `isAiSdkProvider()` method required for provider interface compliance

**Critical preservation checks**:

```bash
# Verify Claude Code files exist
ls src/integrations/claude-code/streaming-client.ts
grep "TOOL_NAME_PREFIX.*=.*\"oc_\"" src/integrations/claude-code/streaming-client.ts

# Run tests after merge
cd src && npx vitest run integrations/claude-code/__tests__/
```

### Post-Merge Validation Checklist

**Run these commands after upstream merge to verify critical Claude Code components:**

```bash
#!/bin/bash
# Copy-paste this entire block to validate Claude Code integration

echo "=== Validating Claude Code Components ==="

# 1. Backend schema validation
echo -n "✓ Provider schema: "
grep -q 'claudeCodeSchema' packages/types/src/provider-settings.ts && \
grep -q 'claudeCodeSchema.*claude-code' packages/types/src/provider-settings.ts && \
echo "PASS" || echo "FAIL - missing from discriminated union"

# 2. Provider factory registration (CRITICAL!)
echo -n "✓ Provider export: "
grep -q 'export.*ClaudeCodeHandler' src/api/providers/index.ts && \
echo "PASS" || echo "FAIL - not exported from providers/index.ts"

echo -n "✓ Provider import: "
grep -q 'ClaudeCodeHandler' src/api/index.ts | grep -q 'import' && \
echo "PASS" || echo "FAIL - not imported in api/index.ts"

echo -n "✓ Provider factory case: "
grep -q 'case "claude-code"' src/api/index.ts && \
echo "PASS" || echo "FAIL - missing switch case in buildApiHandler()"

# 3. OAuth manager initialization
echo -n "✓ OAuth init: "
grep -q 'claudeCodeOAuthManager.initialize' src/extension.ts && \
echo "PASS" || echo "FAIL - not initialized in extension.ts"

# 4. Frontend UI components
echo -n "✓ UI exports: "
grep -q 'export.*ClaudeCode' webview-ui/src/components/settings/providers/index.ts && \
echo "PASS" || echo "FAIL - missing from provider exports"

echo -n "✓ UI dropdown: "
grep -q 'claude-code.*Claude Code' webview-ui/src/components/settings/constants.ts && \
echo "PASS" || echo "FAIL - missing from PROVIDERS array"

echo -n "✓ UI config: "
grep -q 'claude-code.*claudeCodeDefaultModelId' webview-ui/src/components/settings/ApiOptions.tsx && \
echo "PASS" || echo "FAIL - missing from PROVIDER_MODEL_CONFIG"

# 5. Activity bar branding
echo -n "✓ Activity bar: "
grep -q 'klaus-code-ActivityBar' src/package.json && \
echo "PASS" || echo "FAIL - upstream overwrote with roo-cline IDs"

# 6. Tool name prefix (critical)
echo -n "✓ Tool prefix: "
grep -q 'TOOL_NAME_PREFIX.*=.*"oc_"' src/integrations/claude-code/streaming-client.ts && \
echo "PASS" || echo "FAIL - tool prefix constant missing"

# 7. Type checks and tests
echo -n "✓ Types: "
pnpm check-types --filter @klaus-code/types &>/dev/null && echo "PASS" || echo "FAIL"

echo -n "✓ Tests: "
cd src && npx vitest run integrations/claude-code/__tests__/ &>/dev/null && \
echo "PASS" || echo "FAIL"

echo "=== Validation Complete ==="
```

**If any checks fail:**

- Schema: Add `claudeCodeSchema` to packages/types/src/provider-settings.ts (see commit `90a46aa3d`)
- Provider export: Add `export { ClaudeCodeHandler } from "./claude-code"` to src/api/providers/index.ts
- Provider import: Add `ClaudeCodeHandler` to imports in src/api/index.ts
- Provider factory: Add switch case in src/api/index.ts buildApiHandler():
    ```typescript
    case "claude-code":
        return new ClaudeCodeHandler(options)
    ```
- OAuth init: Add `claudeCodeOAuthManager.initialize(context, ...)` to src/extension.ts:162
- UI exports: Export ClaudeCode in webview-ui/src/components/settings/providers/index.ts
- UI dropdown: Add to PROVIDERS in webview-ui/src/components/settings/constants.ts
- UI config: Add to PROVIDER_MODEL_CONFIG in webview-ui/src/components/settings/ApiOptions.tsx
- Activity bar: Run `scripts/merge-upstream-fix-branding.sh` to restore klaus-code IDs
- Tool prefix: DO NOT MERGE - upstream broke critical OAuth workaround

### Model Addition Workflow

**Successfully added Opus 4.6 (commit `874ac3334`)**:

1. Model definition in `packages/types/src/providers/claude-code.ts`
2. Pattern matching updated for `opus-4-6` variants
3. No changes needed in `streaming-client.ts` or `claude-code.ts`
4. Tests pass: 22/22 provider tests

**Key insight**: Model string passes directly to API - no provider-side logic for new models.

### Interface Compliance

**New requirement from upstream v3.47.2**:

```typescript
// src/api/providers/claude-code.ts:380-382
isAiSdkProvider(): boolean {
    return false  // Claude Code uses native Anthropic SDK
}
```

Required by `ApiHandler` interface after AI SDK migrations (Gemini, Vertex, HuggingFace).

### Usage Tracking Reverse Engineering

**Analyzed official Claude Code CLI flows (2026-02-06)**:

Using mitmproxy to capture HTTP traffic from `claude-cli/2.1.34`, discovered:

1. **Quota checking mechanism**: Sends minimal message with `content: "quota"` to fetch usage
2. **Unified rate limit headers**:
    - Three tiers: 5-hour, 7-day, overage
    - Each tier reports status, reset time, and utilization percentage
    - `representative-claim` indicates which tier is most restrictive
3. **Token usage tracking**: Every message response includes detailed usage object with:
    - Input/output token counts
    - Prompt caching breakdown (ephemeral 5m/1h tiers)
    - Service tier and inference geo metadata
4. **Account settings endpoint**: `/api/oauth/account/settings` called at startup
5. **Header requirements**: Matches previously documented headers with `x-app: cli` identifier

**Implementation files for Klaus Code:**

- Add usage header parsing in `streaming-client.ts`
- Aggregate statistics in `claude-code.ts` provider
- Display UI in webview components

**Analysis method:**

```bash
# Capture traffic
mitmweb --listen-host 127.0.0.1 --listen-port 58888

# Export flows
# File: docs/2026.02.06-claude-flows.hur (241KB)

# Analyze with strings and grep
strings flows.hur | grep -E "(usage|quota|ratelimit)" | less
```

## Related Commits

- `6173606`: fix(claude-code): prefix tool names to bypass OAuth validation
- `f578dfb`: fix: prefix tool_choice.name when type is tool
- `47bba1c2f`: feat: add Claude Opus 4.6 support across all providers (upstream)
- `874ac3334`: feat: add Claude Opus 4.6 support to Claude Code provider (Klaus Code)
- `32db1d43d`: chore: merge upstream Roo Code changes (2026-02-06)

## See Also

- `DEVELOPMENT.md` - Main development documentation, merge procedures
- `src/integrations/claude-code/streaming-client.ts` - Source of truth for prefixing logic
- `src/api/providers/claude-code.ts` - Main connector implementation
- `packages/types/src/providers/claude-code.ts` - Model definitions and normalization
