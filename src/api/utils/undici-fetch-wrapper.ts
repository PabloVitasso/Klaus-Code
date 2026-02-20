/**
 * Undici-based fetch wrapper for fixing Node.js 20+ localhost streaming issues
 */

import { Client, Dispatcher } from "undici"

const clientCache = new Map<string, Client>()

function getOrCreateClient(baseURL: string): Client {
	if (!clientCache.has(baseURL)) {
		clientCache.set(baseURL, new Client(baseURL))
	}
	return clientCache.get(baseURL)!
}

interface FetchHeaders {
	[key: string]: string | string[] | undefined
}

class HeadersWrapper {
	private headersMap = new Map<string, string>()

	constructor(headers: FetchHeaders) {
		for (const [key, value] of Object.entries(headers)) {
			if (value === undefined) continue
			const headerValue = Array.isArray(value) ? value.join(",") : String(value)
			this.headersMap.set(key.toLowerCase(), headerValue)
		}
	}

	get(name: string): string | null {
		return this.headersMap.get(name.toLowerCase()) ?? null
	}

	has(name: string): boolean {
		return this.headersMap.has(name.toLowerCase())
	}

	entries(): IterableIterator<[string, string]> {
		return this.headersMap.entries()
	}

	[Symbol.iterator](): IterableIterator<[string, string]> {
		return this.headersMap.entries()
	}

	forEach(callback: (value: string, key: string, parent: HeadersWrapper) => void, thisArg?: unknown): void {
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
	bodyUsed = false

	constructor(statusCode: number, headers: FetchHeaders, body: AsyncIterable<Buffer>) {
		this.status = statusCode
		this.ok = statusCode >= 200 && statusCode < 300
		this.statusText = ""
		this.headers = new HeadersWrapper(headers)
		this.body = body
	}

	async json(): Promise<any> {
		const text = await this.text()
		return JSON.parse(text)
	}

	async text(): Promise<string> {
		let data = ""
		for await (const chunk of this.body) {
			data += chunk.toString()
		}
		return data
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		const buffer = await this.blob()
		return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
	}

	async blob(): Promise<Buffer> {
		let data = Buffer.alloc(0)
		for await (const chunk of this.body) {
			data = Buffer.concat([data, chunk])
		}
		return data
	}

	clone(): never {
		throw new Error("Response.clone() not implemented")
	}
}

/**
 * Create undici-based fetch
 */
export function createUndiciFetch() {
	return async function fetch(url: string | URL, options?: RequestInit & { timeout?: number }): Promise<any> {
		const urlObj = new URL(url)
		const baseURL = `${urlObj.protocol}//${urlObj.host}`
		const path = urlObj.pathname + (urlObj.search ?? "")

		const client = getOrCreateClient(baseURL)

		const method: Dispatcher.HttpMethod = (options?.method?.toUpperCase() ?? "GET") as Dispatcher.HttpMethod

		const headers = (options?.headers as Record<string, string>) ?? undefined

		// Narrow body for undici
		let body: string | Buffer | Uint8Array | null | undefined = undefined

		if (typeof options?.body === "string") body = options.body
		else if (options?.body instanceof Buffer) body = options.body
		else if (options?.body instanceof Uint8Array) body = options.body
		else if (options?.body == null) body = undefined
		else body = String(options.body)

		try {
			const response: Dispatcher.ResponseData = await client.request({
				path,
				method,
				headers,
				body,
			})

			return new FetchResponse(response.statusCode, response.headers as FetchHeaders, response.body)
		} catch (error) {
			throw new Error(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

/**
 * Install global fetch override
 */
export function installUndiciFetchWrapper(): (() => void) | void {
	if (typeof globalThis === "undefined") {
		return
	}

	const originalFetch = (globalThis as any).fetch
	;(globalThis as any).fetch = createUndiciFetch()

	console.log("[undici-fetch-wrapper] Global fetch replaced with undici Client implementation")

	return () => {
		;(globalThis as any).fetch = originalFetch
		for (const client of clientCache.values()) {
			client.close().catch(() => {})
		}
		clientCache.clear()
	}
}
