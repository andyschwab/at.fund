'use client'

import { CodeBlock } from '../ui'

const SNIPPETS = [
  {
    title: 'Resolve a builder',
    description:
      'Look up any handle, DID, or hostname to get their full identity, funding info, capabilities, and dependencies.',
    code: `const res = await fetch('https://at.fund/api/entry?uri=blacksky.app')
const { entry, referenced } = await res.json()

console.log(entry.displayName)   // "Blacksky"
console.log(entry.contributeUrl) // "https://..."
console.log(entry.tags)          // ["tool", "pds-host"]
console.log(entry.capabilities)  // [{ type: "pds", hostname: "..." }]
console.log(referenced.length)   // dependencies resolved transitively`,
  },
  {
    title: 'Check if someone accepts funding',
    description:
      'Quick check — thin resolution returns identity + funding only, no capabilities or dependency tree.',
    code: `const res = await fetch('https://at.fund/api/steward?uri=alice.bsky.social')
const steward = await res.json()

if (steward.contributeUrl) {
  console.log(\`Fund \${steward.displayName}: \${steward.contributeUrl}\`)
} else {
  console.log(\`\${steward.displayName} has no funding link yet\`)
}`,
  },
  {
    title: 'Embed a support button',
    description:
      'Drop an iframe into any page to show a funding button for an AT Protocol builder. Self-contained — no external CSS needed.',
    code: `<!-- Embed a support button for any handle or DID -->
<iframe
  src="https://at.fund/embed/blacksky.app"
  style="border: none; width: 320px; height: 80px;"
  title="Support on at.fund"
></iframe>`,
    language: 'html',
  },
  {
    title: 'Read a streaming scan',
    description:
      'The streaming endpoint emits newline-delimited JSON events as the 6-phase pipeline runs. Requires authentication.',
    code: `const res = await fetch('https://at.fund/api/lexicons/stream', {
  credentials: 'include'
})
const reader = res.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })

  const lines = buffer.split('\\n')
  buffer = lines.pop() // keep incomplete line in buffer

  for (const line of lines) {
    if (!line.trim()) continue
    const event = JSON.parse(line)

    switch (event.type) {
      case 'meta':    // { did, handle, pdsUrl }
      case 'status':  // { message }
      case 'entry':   // { entry: StewardEntry }
      case 'done':    // scan complete
        console.log(event.type, event)
    }
  }
}`,
  },
  {
    title: 'Fetch lexicon schemas',
    description:
      'Retrieve the fund.at.* lexicon definitions programmatically. Useful for building tools that validate or generate records.',
    code: `// List all available lexicon IDs
const ids = await fetch('https://at.fund/lexicon').then(r => r.json())
// ["fund.at.actor.declaration", "fund.at.funding.contribute", ...]

// Fetch a specific schema
const schema = await fetch('https://at.fund/lexicon/fund.at.funding.contribute')
  .then(r => r.json())

console.log(schema.defs.main.record.properties)
// { url: { type: "string", format: "uri" }, ... }`,
  },
]

export function Snippets() {
  return (
    <div className="space-y-8">
      {SNIPPETS.map((s) => (
        <div key={s.title}>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{s.title}</h3>
          <p className="mt-1 mb-3 text-sm text-slate-500 dark:text-slate-400">{s.description}</p>
          <CodeBlock code={s.code} language={s.language} />
        </div>
      ))}
    </div>
  )
}
