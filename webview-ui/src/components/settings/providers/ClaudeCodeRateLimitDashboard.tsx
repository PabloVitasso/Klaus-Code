import React, { useEffect, useState, useCallback } from "react"
import type { ClaudeCodeRateLimitInfo } from "@klaus-code/types"
import { vscode } from "@src/utils/vscode"

interface ClaudeCodeRateLimitDashboardProps {
	isAuthenticated: boolean
}

/**
 * Formats a Unix timestamp reset time into a human-readable duration
 */
function formatResetTime(resetTimestamp: number): string {
	if (!resetTimestamp) return "N/A"

	const now = Date.now() / 1000 // Current time in seconds
	const diff = resetTimestamp - now

	if (diff <= 0) return "now"

	const hours = Math.floor(diff / 3600)
	const minutes = Math.floor((diff % 3600) / 60)

	if (hours > 24) {
		const days = Math.floor(hours / 24)
		const remainingHours = hours % 24
		return `${days} day${days > 1 ? "s" : ""} ${remainingHours} hr`
	}

	if (hours > 0) {
		return `${hours} hr ${minutes} min`
	}

	return `${minutes} min`
}

/**
 * Formats utilization as a percentage (capped at 100% for display)
 */
function formatUtilization(utilization: number): string {
	const percentage = Math.min(Math.round(utilization * 100), 100)
	return `${percentage}%`
}

/**
 * Progress bar component for displaying usage
 */
const UsageProgressBar: React.FC<{ utilization: number; label: string }> = ({ utilization, label }) => {
	const percentage = Math.min(utilization * 100, 100)
	const isWarning = percentage >= 80
	const isCritical = percentage >= 95

	return (
		<div className="w-full">
			{label && <div className="text-xs text-vscode-descriptionForeground mb-1">{label}</div>}
			<div className="w-full bg-vscode-input-background rounded-sm h-1.5 overflow-hidden">
				<div
					className={`h-full transition-all duration-300 ${
						isCritical
							? "bg-vscode-errorForeground"
							: isWarning
								? "bg-vscode-editorWarning-foreground"
								: "bg-vscode-button-background"
					}`}
					style={{ width: `${percentage}%` }}
				/>
			</div>
		</div>
	)
}

export const ClaudeCodeRateLimitDashboard: React.FC<ClaudeCodeRateLimitDashboardProps> = ({ isAuthenticated }) => {
	const [rateLimits, setRateLimits] = useState<ClaudeCodeRateLimitInfo | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const fetchRateLimits = useCallback(() => {
		if (!isAuthenticated) {
			setRateLimits(null)
			setError(null)
			return
		}

		setIsLoading(true)
		setError(null)
		vscode.postMessage({ type: "requestClaudeCodeRateLimits" })
	}, [isAuthenticated])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "claudeCodeRateLimits") {
				setIsLoading(false)
				if (message.error) {
					setError(message.error)
					setRateLimits(null)
				} else if (message.values) {
					setRateLimits(message.values)
					setError(null)
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	// Fetch rate limits when authenticated
	useEffect(() => {
		if (isAuthenticated) {
			fetchRateLimits()
		}
	}, [isAuthenticated, fetchRateLimits])

	if (!isAuthenticated) {
		return null
	}

	if (isLoading && !rateLimits) {
		return (
			<div className="bg-vscode-editor-background border border-vscode-panel-border rounded-md p-3">
				<div className="text-sm text-vscode-descriptionForeground">Loading rate limits...</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="bg-vscode-editor-background border border-vscode-panel-border rounded-md p-3">
				<div className="flex items-center justify-between">
					<div className="text-sm text-vscode-errorForeground">Failed to load rate limits</div>
					<button
						onClick={fetchRateLimits}
						className="text-xs text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground cursor-pointer bg-transparent border-none">
						Retry
					</button>
				</div>
			</div>
		)
	}

	if (!rateLimits) {
		return null
	}

	return (
		<div className="bg-vscode-editor-background border border-vscode-panel-border rounded-md p-3">
			<div className="mb-2">
				<div className="text-sm font-medium text-vscode-foreground">Plan usage limits</div>
			</div>

			<div className="space-y-4">
				{/* Current session (5-hour limit) */}
				<div>
					<div className="flex items-center justify-between mb-1.5">
						<span className="text-xs font-medium text-vscode-foreground">Current session</span>
					</div>
					<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground mb-1.5">
						<span>Resets in {formatResetTime(rateLimits.fiveHour.resetTime)}</span>
						<span className="font-medium">{formatUtilization(rateLimits.fiveHour.utilization)} used</span>
					</div>
					<UsageProgressBar utilization={rateLimits.fiveHour.utilization} label="" />
				</div>

				{/* Weekly limits */}
				{rateLimits.weeklyUnified && (
					<div>
						<div className="flex items-center justify-between mb-1.5">
							<span className="text-xs font-medium text-vscode-foreground">Weekly limits</span>
						</div>
						<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground mb-1.5">
							<span>Resets in {formatResetTime(rateLimits.weeklyUnified.resetTime)}</span>
							<span className="font-medium">
								{formatUtilization(rateLimits.weeklyUnified.utilization)} used
							</span>
						</div>
						<UsageProgressBar utilization={rateLimits.weeklyUnified.utilization} label="" />
					</div>
				)}

				{/* Extra usage */}
				{rateLimits.overage && (
					<div>
						<div className="flex items-center justify-between mb-1.5">
							<span className="text-xs font-medium text-vscode-foreground">Extra usage</span>
						</div>
						<div className="flex items-center justify-between text-xs text-vscode-descriptionForeground mb-1.5">
							<span>Resets in {formatResetTime(rateLimits.overage.resetTime)}</span>
							<span className="font-medium">
								{formatUtilization(rateLimits.overage.utilization)} used
							</span>
						</div>
						<UsageProgressBar utilization={rateLimits.overage.utilization} label="" />
						{rateLimits.overage.disabledReason && (
							<div className="text-xs text-vscode-descriptionForeground italic mt-1">
								{rateLimits.overage.disabledReason}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
}
