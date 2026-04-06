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
]

export const SECTIONS: Array<{ title: string; subtitle: string; ids: string[] }> = [
  {
    title: 'Public API',
    subtitle: 'No authentication required',
    ids: ['steward', 'entry'],
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
