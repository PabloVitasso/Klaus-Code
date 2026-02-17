import type { ModelInfo } from "../model.js"

/**
 * Rate limit information from Claude Code API
 */
export interface ClaudeCodeRateLimitInfo {
	// 5-hour limit info
	fiveHour: {
		status: string
		utilization: number
		resetTime: number // Unix timestamp
	}
	// 7-day (weekly) limit info (Sonnet-specific)
	weekly?: {
		status: string
		utilization: number
		resetTime: number // Unix timestamp
	}
	// 7-day unified limit info
	weeklyUnified?: {
		status: string
		utilization: number
		resetTime: number // Unix timestamp
	}
	// Representative claim type
	representativeClaim?: string
	// Overage/extra usage info
	overage?: {
		status: string
		utilization: number
		resetTime: number // Unix timestamp (first of next month)
		disabledReason?: string
		usedCredits?: number // Raw credits used (e.g., 2396.0)
		monthlyLimit?: number // Raw monthly limit (e.g., 4250)
	}
	// Fallback percentage
	fallbackPercentage?: number
	// Organization ID
	organizationId?: string
	// Timestamp when this was fetched
	fetchedAt: number
}

// Regex pattern to strip date suffix from model names
const DATE_SUFFIX_PATTERN = /-\d{8}$/

// Models that work with Claude Code OAuth tokens
// See: https://docs.anthropic.com/en/docs/claude-code
// NOTE: Claude Code is subscription-based with no per-token cost - pricing fields are 0
// Current as of claude-code CLI v2.1.45 (2026-02-17)
export const claudeCodeModels = {
	// Full versioned ID required by API - no reasoning/thinking for haiku
	"claude-haiku-4-5-20251001": {
		maxTokens: 32768,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		description: "Claude Haiku 4.5",
	},
	// Adaptive thinking with effort levels (low/medium/high)
	"claude-sonnet-4-6": {
		maxTokens: 32768,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningEffort: ["disable", "low", "medium", "high"],
		reasoningEffort: "low",
		description: "Claude Sonnet 4.6",
	},
	"claude-opus-4-6": {
		maxTokens: 128_000,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningEffort: ["disable", "low", "medium", "high"],
		reasoningEffort: "medium",
		description: "Claude Opus 4.6",
	},
} as const satisfies Record<string, ModelInfo>

// Claude Code - Only models that work with Claude Code OAuth tokens
export type ClaudeCodeModelId = keyof typeof claudeCodeModels
export const claudeCodeDefaultModelId: ClaudeCodeModelId = "claude-sonnet-4-6"

/**
 * Model family patterns for normalization.
 * Maps regex patterns to their canonical Claude Code model IDs.
 *
 * Order matters - more specific patterns should come first.
 */
const MODEL_FAMILY_PATTERNS: Array<{ pattern: RegExp; target: ClaudeCodeModelId }> = [
	// Opus 4.6 (specific version) → claude-opus-4-6
	{ pattern: /opus.*4[._-]?6/i, target: "claude-opus-4-6" },
	// Opus models (any other version) → claude-opus-4-6 (fallback to latest)
	{ pattern: /opus/i, target: "claude-opus-4-6" },
	// Haiku models (any version) → claude-haiku-4-5-20251001
	{ pattern: /haiku/i, target: "claude-haiku-4-5-20251001" },
	// Sonnet 4.6 specifically → claude-sonnet-4-6
	{ pattern: /sonnet.*4[._-]?6/i, target: "claude-sonnet-4-6" },
	// Sonnet models (any other version) → claude-sonnet-4-6 (fallback to latest)
	{ pattern: /sonnet/i, target: "claude-sonnet-4-6" },
]

/**
 * Normalizes a Claude model ID to a valid Claude Code model ID.
 *
 * This function handles backward compatibility for legacy model names
 * that may include version numbers or date suffixes. It maps:
 * - claude-sonnet-4-6, claude-sonnet-4-5-*, claude-3-7-sonnet-*, etc. → claude-sonnet-4-6
 * - claude-opus-4-6 → claude-opus-4-6
 * - claude-haiku-4-5-20251001, claude-haiku-4-5, claude-3-5-haiku-* → claude-haiku-4-5-20251001
 *
 * @param modelId - The model ID to normalize (may be a legacy format)
 * @returns A valid ClaudeCodeModelId, or the default if no match
 *
 * @example
 * normalizeClaudeCodeModelId("claude-sonnet-4-6") // returns "claude-sonnet-4-6"
 * normalizeClaudeCodeModelId("claude-3-5-sonnet-20241022") // returns "claude-sonnet-4-6"
 * normalizeClaudeCodeModelId("claude-haiku-4-5-20251001") // returns "claude-haiku-4-5-20251001"
 */
export function normalizeClaudeCodeModelId(modelId: string): ClaudeCodeModelId {
	// If already a valid model ID, return as-is
	// Use Object.hasOwn() instead of 'in' operator to avoid matching inherited properties like 'toString'
	if (Object.hasOwn(claudeCodeModels, modelId)) {
		return modelId as ClaudeCodeModelId
	}

	// Strip date suffix if present (e.g., -20250514)
	const withoutDate = modelId.replace(DATE_SUFFIX_PATTERN, "")

	// Check if stripping the date makes it valid
	if (Object.hasOwn(claudeCodeModels, withoutDate)) {
		return withoutDate as ClaudeCodeModelId
	}

	// Match by model family
	for (const { pattern, target } of MODEL_FAMILY_PATTERNS) {
		if (pattern.test(modelId)) {
			return target
		}
	}

	// Fallback to default if no match (shouldn't happen with valid Claude models)
	return claudeCodeDefaultModelId
}

/**
 * Reasoning effort levels for Claude Code adaptive thinking mode (v2.1.45+).
 * Models claude-sonnet-4-6 and claude-opus-4-6 use adaptive thinking with
 * output_config.effort instead of budget_tokens.
 *
 * API request body:
 *   thinking: { type: "adaptive" }
 *   output_config: { effort: "low" | "medium" | "high" }  (omit to use model default)
 *
 * "disable" → send thinking: {type: "adaptive"} with no output_config
 */
export const claudeCodeReasoningConfig = {
	low: { effort: "low" as const },
	medium: { effort: "medium" as const },
	high: { effort: "high" as const },
} as const

export type ClaudeCodeReasoningLevel = keyof typeof claudeCodeReasoningConfig
