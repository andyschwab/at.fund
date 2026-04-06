// ---------------------------------------------------------------------------
// Shared endpoint catalog — used by ApiExplorer and Snippets
// ---------------------------------------------------------------------------

export type Method = 'GET' | 'POST' | 'DELETE'
export type AuthLevel = 'public' | 'auth' | 'admin'

export type ParamDef = {
  kind: 'query' | 'body'
  key?: string // required when kind='query'
  label: string
  placeholder: string
  default?: string
  multiline?: boolean
}

export type EndpointConfig = {
  id: string
  method: Method
  path: string
  description: string
  auth: AuthLevel
  params?: ParamDef[]
  streaming?: boolean
  note?: string
}

export const ENDPOINTS: EndpointConfig[] = [
  // ── Public ──────────────────────────────────────────────────────────────
  {
    id: 'health',
    method: 'GET',
    path: '/api/health',
    description: 'Health check — confirms the server is reachable.',
    auth: 'public',
  },
  {
    id: 'auth-check',
    method: 'GET',
    path: '/api/auth/check',
    description: 'Returns current session validity. { valid: bool, did: string | null }',
    auth: 'public',
  },
  {
    id: 'steward',
    method: 'GET',
    path: '/api/steward',
    description:
      'Thin resolution — identity + funding only. No capability discovery or transitive dependency resolution. Use /api/entry for the full pipeline.',
    auth: 'public',
    params: [
      {
        kind: 'query',
        key: 'uri',
        label: 'uri',
        placeholder: 'handle, DID, or hostname',
        default: 'atprotocol.dev',
      },
    ],
  },
  {
    id: 'entry',
    method: 'GET',
    path: '/api/entry',
    description:
      'Full vertical resolution for a single URI — identity → funding → capabilities → dependencies. Returns { entry: StewardEntry, referenced: StewardEntry[] }.',
    auth: 'public',
    params: [
      {
        kind: 'query',
        key: 'uri',
        label: 'uri',
        placeholder: 'handle, DID, or hostname',
        default: 'atprotocol.dev',
      },
    ],
  },
  // ── Auth ────────────────────────────────────────────────────────────────
  {
    id: 'lexicons',
    method: 'GET',
    path: '/api/lexicons',
    description: 'Non-streaming repo scan for the signed-in user. Accepts optional extra steward URIs to append.',
    auth: 'auth',
    params: [
      {
        kind: 'query',
        key: 'extraStewards',
        label: 'extraStewards',
        placeholder: 'comma-separated URIs (optional)',
      },
    ],
  },
  {
    id: 'lexicons-stream',
    method: 'GET',
    path: '/api/lexicons/stream',
    description:
      'Streaming NDJSON scan. Each newline-delimited JSON object is a pipeline event: meta, status, entry, referenced, warning, done.',
    auth: 'auth',
    params: [
      {
        kind: 'query',
        key: 'extraStewards',
        label: 'extraStewards',
        placeholder: 'comma-separated URIs (optional)',
      },
    ],
    streaming: true,
  },
  {
    id: 'lexicons-post',
    method: 'POST',
    path: '/api/lexicons',
    description: 'Repo scan with self-reported steward URIs supplied in the request body.',
    auth: 'auth',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"selfReportedStewards":["bsky.app"]}',
        default: '{"selfReportedStewards":[]}',
      },
    ],
  },
  {
    id: 'endorse',
    method: 'POST',
    path: '/api/endorse',
    description: 'Create a fund.at.endorse record on your PDS. Idempotent — endorsing the same URI twice is a no-op.',
    auth: 'auth',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"uri":"bsky.app"}',
        default: '{"uri":""}',
      },
    ],
  },
  {
    id: 'endorse-delete',
    method: 'DELETE',
    path: '/api/endorse',
    description: 'Remove a fund.at.endorse record from your PDS.',
    auth: 'auth',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"uri":"bsky.app"}',
        default: '{"uri":""}',
      },
    ],
  },
  {
    id: 'setup',
    method: 'POST',
    path: '/api/setup',
    description:
      'Publish fund.at records to your PDS — writes fund.at.contribute and/or fund.at.dependency records.',
    auth: 'auth',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"contributeUrl":"https://...","dependencies":[{"uri":"bsky.app"}]}',
        default: '{\n  "contributeUrl": "",\n  "dependencies": []\n}',
        multiline: true,
      },
    ],
  },
]

export const SECTIONS: Array<{ title: string; subtitle: string; ids: string[] }> = [
  {
    title: 'Public',
    subtitle: 'No authentication required',
    ids: ['health', 'auth-check', 'steward', 'entry'],
  },
  {
    title: 'Authenticated',
    subtitle: 'Requires an active session — sign in via the navbar first',
    ids: ['lexicons', 'lexicons-stream', 'lexicons-post', 'endorse', 'endorse-delete', 'setup'],
  },
]

/** Generate a copy-pasteable fetch() snippet for an endpoint. */
export function generateFetchSnippet(ep: EndpointConfig, values: Record<string, string>): string {
  const qp = new URLSearchParams()
  let bodyStr: string | undefined

  ep.params?.forEach((p) => {
    if (p.kind === 'query') {
      const v = values[p.key ?? '']?.trim()
      if (v) qp.set(p.key ?? '', v)
    } else {
      const v = values['body']?.trim()
      if (v) bodyStr = v
    }
  })

  const qs = qp.toString()
  const url = `https://at.fund${ep.path}${qs ? `?${qs}` : ''}`

  const opts: string[] = []
  if (ep.method !== 'GET') opts.push(`  method: '${ep.method}'`)
  if (bodyStr) {
    opts.push(`  headers: { 'Content-Type': 'application/json' }`)
    opts.push(`  body: JSON.stringify(${bodyStr})`)
  }

  const optsStr = opts.length > 0 ? `, {\n${opts.join(',\n')}\n}` : ''

  if (ep.streaming) {
    return `const res = await fetch('${url}'${optsStr})
const reader = res.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const lines = decoder.decode(value, { stream: true }).split('\\n')
  for (const line of lines) {
    if (line.trim()) console.log(JSON.parse(line))
  }
}`
  }

  return `const res = await fetch('${url}'${optsStr})
const data = await res.json()
console.log(data)`
}
