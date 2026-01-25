# Claude Code Connector Documentation

This document describes the Claude Code OAuth authentication mechanism and the special `oc_` tool name prefixing workaround required for tool calling.

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

**Billing Header in System Prompt:**

Klaus Code also adds a billing header to the system prompt for usage tracking:

```typescript
body.system = [
	{
		type: "text",
		text: `x-anthropic-billing-header: kc_version=${Package.version}; kc_entrypoint=vscode`,
	},
	{ type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
	// ... rest of system prompt
]
```

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

## Related Commits

- `6173606`: fix(claude-code): prefix tool names to bypass OAuth validation
- `f578dfb`: fix: prefix tool_choice.name when type is tool

## See Also

- `DEVELOPMENT.md` - Main development documentation
- `src/integrations/claude-code/streaming-client.ts` - Source of truth for prefixing logic
- `src/api/providers/claude-code.ts` - Main connector implementation
