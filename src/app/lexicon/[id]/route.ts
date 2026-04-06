import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/** GET /lexicon/:id — serve a raw lexicon JSON schema by ID */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    return NextResponse.json(
      { error: 'Invalid lexicon ID format' },
      { status: 400 },
    )
  }

  const filePath = path.join(process.cwd(), 'lexicon', `${id}.json`)

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        { error: `Lexicon '${id}' not found` },
        { status: 404 },
      )
    }
    return NextResponse.json(
      { error: 'Failed to read lexicon' },
      { status: 500 },
    )
  }
}
