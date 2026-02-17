import { normalizeClaudeCodeModelId } from "../claude-code.js"

describe("normalizeClaudeCodeModelId", () => {
	test("should return valid model IDs unchanged", () => {
		expect(normalizeClaudeCodeModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6")
		expect(normalizeClaudeCodeModelId("claude-opus-4-6")).toBe("claude-opus-4-6")
		expect(normalizeClaudeCodeModelId("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001")
	})

	test("should normalize sonnet models to claude-sonnet-4-6", () => {
		// Sonnet 4.6 with date
		expect(normalizeClaudeCodeModelId("claude-sonnet-4-6-20250929")).toBe("claude-sonnet-4-6")
		// Sonnet 4.5 (legacy)
		expect(normalizeClaudeCodeModelId("claude-sonnet-4-5")).toBe("claude-sonnet-4-6")
		// Sonnet 4 (legacy)
		expect(normalizeClaudeCodeModelId("claude-sonnet-4-20250514")).toBe("claude-sonnet-4-6")
		// Claude 3.7 Sonnet
		expect(normalizeClaudeCodeModelId("claude-3-7-sonnet-20250219")).toBe("claude-sonnet-4-6")
		// Claude 3.5 Sonnet
		expect(normalizeClaudeCodeModelId("claude-3-5-sonnet-20241022")).toBe("claude-sonnet-4-6")
	})

	test("should normalize opus models to claude-opus-4-6", () => {
		// Opus 4.5 (legacy)
		expect(normalizeClaudeCodeModelId("claude-opus-4-5")).toBe("claude-opus-4-6")
		// Opus 4.1 (legacy)
		expect(normalizeClaudeCodeModelId("claude-opus-4-1-20250805")).toBe("claude-opus-4-6")
		// Opus 4 (legacy)
		expect(normalizeClaudeCodeModelId("claude-opus-4-20250514")).toBe("claude-opus-4-6")
	})

	test("should normalize haiku models to claude-haiku-4-5-20251001", () => {
		// Haiku 4.5 with date (direct match after date strip)
		expect(normalizeClaudeCodeModelId("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001")
		// Claude 3.5 Haiku
		expect(normalizeClaudeCodeModelId("claude-3-5-haiku-20241022")).toBe("claude-haiku-4-5-20251001")
		// Haiku without date
		expect(normalizeClaudeCodeModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5-20251001")
	})

	test("should handle case-insensitive model family matching", () => {
		expect(normalizeClaudeCodeModelId("Claude-Sonnet-4-6-20250929")).toBe("claude-sonnet-4-6")
		expect(normalizeClaudeCodeModelId("CLAUDE-OPUS-4-6")).toBe("claude-opus-4-6")
	})

	test("should fallback to default for unrecognized models", () => {
		expect(normalizeClaudeCodeModelId("unknown-model")).toBe("claude-sonnet-4-6")
		expect(normalizeClaudeCodeModelId("gpt-4")).toBe("claude-sonnet-4-6")
	})
})
