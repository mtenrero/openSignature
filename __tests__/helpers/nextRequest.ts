// Utilities for invoking Next.js App Router route handlers directly from Jest.
// Wraps NextRequest construction so tests stay declarative.
import { NextRequest } from 'next/server'

interface BuildRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url?: string
  body?: unknown
  headers?: Record<string, string>
  searchParams?: Record<string, string>
}

export function buildRequest(opts: BuildRequestOptions = {}): NextRequest {
  const method = opts.method ?? 'GET'
  const base = opts.url ?? 'http://localhost:3000/test'
  const url = new URL(base)
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      url.searchParams.set(k, v)
    }
  }

  const headers = new Headers(opts.headers ?? {})
  if (opts.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const init: RequestInit = {
    method,
    headers,
  }
  if (opts.body !== undefined && method !== 'GET') {
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
  }

  return new NextRequest(url.toString(), init)
}

export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
