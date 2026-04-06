import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/** GET /lexicon — list all available fund.at.* lexicon IDs */
export async function GET() {
  const dir = path.join(process.cwd(), 'lexicon')
  const files = await fs.promises.readdir(dir)
  const ids = files
    .filter((f: string) => f.startsWith('fund.at.') && f.endsWith('.json'))
    .map((f: string) => f.replace(/\.json$/, ''))
    .sort()

  return NextResponse.json(ids, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  })
}
