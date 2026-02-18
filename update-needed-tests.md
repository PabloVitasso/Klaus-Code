# Test Updates Needed

Tests that need updating after v2.1.45 code changes.

## src/integrations/claude-code/**tests**/streaming-client.spec.ts

### ThinkingConfig type tests

- Add test for `{type: "adaptive"}` variant
- Remove/update tests using `{type: "enabled", budget_tokens: N}` (old API)

### Beta header selection (new: model-aware)

- Add tests verifying `claude-sonnet-4-6` and `claude-opus-4-6` get `adaptiveBetas`
    - Expected: `claude-code-20250219,oauth-2025-04-20,adaptive-thinking-2026-01-28,prompt-caching-scope-2026-01-05,effort-2025-11-24`
- Add tests verifying `claude-haiku-4-5-20251001` and other models get `defaultBetas`
    - Expected: `oauth-2025-04-20,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05`

### Adaptive thinking body building

- `thinking: {type: "adaptive"}` + `reasoningEffort: "low"` → body has `{thinking: {type:"adaptive"}, output_config: {effort:"low"}}`
- `thinking: {type: "adaptive"}` + `reasoningEffort: null` → body has `{thinking: {type:"adaptive"}}`, no `output_config`
- `thinking: {type: "disabled"}` → body has no `thinking` or `output_config`
- Remove tests for `{type: "enabled", budget_tokens: N}` body behavior

### System prompt billing header

- Verify first system block is `{type:"text", text: "x-anthropic-billing-header: cc_version=...; cc_entrypoint=vscode-extension; cch=00000;"}`
- Verify second block is `{type:"text", text: "You are Claude Code, Anthropic's official CLI for Claude."}`
- Verify third block (when systemPrompt provided) has `cache_control: {type:"ephemeral"}`

### User-Agent / Stainless version

- Update expected `User-Agent` to `claude-cli/2.1.45 (external, cli)` (was `claude-cli/2.1.39 ...`)
- Update expected `X-Stainless-Package-Version` to `0.74.0` (was `0.70.0` / `0.73.0`)

---

## src/api/providers/**tests**/claude-code.spec.ts

### Model list

- Remove tests for `claude-sonnet-4-5`, `claude-opus-4-5`
- Rename `claude-haiku-4-5` → `claude-haiku-4-5-20251001`
- Add/update tests for `claude-sonnet-4-6` (default model)
- Confirm `claude-opus-4-6` still present

### Default model

- Update expected default from `claude-sonnet-4-5` to `claude-sonnet-4-6`

### Reasoning config (ThinkingConfig passed to createStreamingMessage)

- When `reasoningLevel = "low"`: expect `thinking: {type:"adaptive"}`, `reasoningEffort: "low"`
- When `reasoningLevel = "medium"`: expect `thinking: {type:"adaptive"}`, `reasoningEffort: "medium"`
- When `reasoningLevel = "high"`: expect `thinking: {type:"adaptive"}`, `reasoningEffort: "high"`
- When reasoning disabled: expect `thinking: {type:"disabled"}`, `reasoningEffort: null`
- Remove all tests asserting `{type:"enabled", budget_tokens: N}`

### getReasoningEffort

- Haiku: no `supportsReasoningEffort` → always returns `null`
- Sonnet-4-6: default effort `"low"` when no override
- Opus-4-6: default effort `"medium"` when no override

---

## packages/types/src/**tests**/claude-code.spec.ts (if exists)

### claudeCodeReasoningConfig

- Each key (`low`, `medium`, `high`) now has `{effort: string}`, not `{budgetTokens: number}`
- Update assertions: `claudeCodeReasoningConfig.low` → `{effort: "low"}`

### normalizeClaudeCodeModelId

- `"claude-sonnet-4-5"` → now maps to `"claude-sonnet-4-6"` (via sonnet pattern)
- `"claude-opus-4-5"` → now maps to `"claude-opus-4-6"` (via opus pattern)
- `"claude-haiku-4-5-20251001"` → direct match, returns as-is
- `"claude-sonnet-4-6"` → direct match, returns as-is
