import { getOAuthClient } from '@/lib/auth/client'
import { NextResponse } from 'next/server'

export async function GET() {
  const client = await getOAuthClient()
  return NextResponse.json(client.clientMetadata)
}
