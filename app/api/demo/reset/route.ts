import { NextResponse } from 'next/server';
import { resetDemoState } from '@/lib/demo';
import { getActionStore } from '@/lib/store';
import { checkRateLimit } from '@/lib/ratelimit';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_RESETS = 3;

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const limit = checkRateLimit(`demo-reset:${ip}`, MAX_RESETS, WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Limite de reinicializações atingido. Tente novamente em alguns minutos.' }, {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSeconds) },
    });
  }
  const audit = await resetDemoState(getActionStore());
  return NextResponse.json({ ok: true, audit });
}
