import { NextResponse } from 'next/server';
import { runAgentService } from '@/lib/agent/service';
import { BUSINESS } from '@/lib/params';

export async function POST(request: Request) {
  let body: { message?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  if (typeof body.message !== 'string') return NextResponse.json({ error: 'A mensagem deve ser um texto.' }, { status: 400 });
  if (body.message.length > BUSINESS.agentMessageMaxLength) return NextResponse.json({ error: `A mensagem pode ter no máximo ${BUSINESS.agentMessageMaxLength} caracteres.` }, { status: 413 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const result = await runAgentService(body.message, ip);
  const headers = result.status === 429 ? { 'Retry-After': String(result.retryAfterSeconds) } : undefined;
  return NextResponse.json(result.body, { status: result.status, headers });
}
