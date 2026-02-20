/**
 * Wrapper to fix OpenAI SDK connection issues with Node.js 20+ and localhost
 *
 * Problem: Node.js 20+ uses undici for fetch(), which has bugs with localhost connections.
 * Both native fetch() and OpenAI SDK fail silently on localhost in streaming mode.
 *
 * Solution: Use undici.Client directly instead of fetch(), which works correctly.
 * This wrapper replaces global fetch with an undici-based implementation.
 */

import * as undici from "undici"

const clientCache = new Map<string, undici.Client>()

function getOrCreateClient(baseURL: string): undici.Client {
	if (!clientCache.has(baseURL)) {
		clientCache.set(baseURL, new undici.Client(baseURL))
	}
	return clientCache.get(baseURL)!
}

interface FetchHeaders {
	[key: string]: string | string[]
}

/**
 * Wrapper for headers that implements the Headers interface
 */
class HeadersWrapper {
	private headersMap: Map<string, string>

	constructor(headers: FetchHeaders) {
		this.headersMap = new Map()
		for (const [key, value] of Object.entries(headers)) {
			const headerValue = Array.isArray(value) ? value.join(",") : String(value)
			this.headersMap.set(key.toLowerCase(), headerValue)
		}
	}

	get(name: string): string | null {
		return this.headersMap.get(name.toLowerCase()) || null
	}

	has(name: string): boolean {
		return this.headersMap.has(name.toLowerCase())
	}

	entries(): IterableIterator<[string, string]> {
		return this.headersMap.entries()
	}

	keys(): IterableIterator<string> {
		return this.headersMap.keys()
	}

	values(): IterableIterator<string> {
		return this.headersMap.values()
	}

	[Symbol.iterator](): IterableIterator<[string, string]> {
		return this.headersMap.entries()
	}

	forEach(callback: (value: string, key: string, parent: HeadersWrapper) => void, thisArg?: any): void {
		this.headersMap.forEach((value, key) => {
			callback.call(thisArg, value, key, this)
		})
	}
}

class FetchResponse {
	ok: boolean
	status: number
	statusText: string
	headers: HeadersWrapper
	body: AsyncIterable<Buffer>
	bodyUsed: boolean = false

	constructor(statusCode: number, headers: FetchHeaders, body: AsyncIterable<Buffer>) {
		this.status = statusCode
		this.ok = statusCode >= 200 && statusCode < 300
		this.statusText = ""
		this.headers = new HeadersWrapper(headers)
		this.body = body
	}

	async json() {
		let data = ""
		for await (const chunk of this.body) {
			data += chunk.toString()
		}
		return JSON.parse(data)
	}

	async text() {
		let data = ""
		for await (const chunk of this.body) {
			data += chunk.toString()
		}
		return data
	}

	async blob() {
		let data = Buffer.alloc(0)
		for await (const chunk of this.body) {
			data = Buffer.concat([data, chunk])
		}
		return data
	}

	async arrayBuffer() {
		const blob = await this.blob()
		return blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
	}

	clone() {
		throw new Error("Response.clone() not implemented in undici wrapper")
	}
}

/**
 * Undici-based fetch wrapper that works with OpenAI SDK
 */
export function createUndicsiFetch() {
	return async function fetch(url: string | URL, options?: RequestInit & { timeout?: number }): Promise<Response> {
		const urlObj = new URL(url)
		const baseURL = `${urlObj.protocol}//${urlObj.host}`
		const path = urlObj.pathname + (urlObj.search || "")

		const client = getOrCreateClient(baseURL)

		try {
			const response = await client.request({
				path,
				method: options?.method || "GET",
				headers: options?.headers as Record<string, string>,
				body: options?.body,
			})

			return new FetchResponse(response.statusCode, response.headers as FetchHeaders, response.body) as any
		} catch (error) {
			throw new Error(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

/**
 * Install the undici-based fetch wrapper as global fetch
 * Call this at the top of your application initialization
 */
export function installUndisciFetchWrapper() {
	if (typeof globalThis !== "undefined") {
		// Store original fetch for debugging/fallback
		const originalFetch = (globalThis as any).fetch

		// Override global fetch
		;(globalThis as any).fetch = createUndicsiFetch()

		console.log("[undici-fetch-wrapper] Global fetch replaced with undici-based implementation")

		// Return cleanup function
		return () => {
			;(globalThis as any).fetch = originalFetch
			// Close all cached clients
			for (const client of clientCache.values()) {
				client.close().catch(() => {})
			}
			clientCache.clear()
		}
	}
}
