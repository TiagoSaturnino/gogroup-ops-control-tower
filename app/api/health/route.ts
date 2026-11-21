import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getHealthStatus } from '@/lib/health';

export async function GET() {
  // Lê o contexto por requisição para não prerenderizar um health status obsoleto.
  await headers();
  return NextResponse.json(getHealthStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
