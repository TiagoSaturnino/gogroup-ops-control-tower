import { NextResponse } from 'next/server';
import { getActionStore } from '@/lib/store';
import { decideAction } from '@/lib/action-decisions';

export async function GET() {
  const store = getActionStore();
  const [actions, audit, orderStates] = await Promise.all([store.listActions(), store.listAudit(), store.getOrderStates()]);
  return NextResponse.json({ actions, audit, orderStates, store: store.kind });
}

export async function POST(request: Request) {
  let body: { actionId?: string; decision?: 'aprovar' | 'rejeitar' };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  if (!body.actionId || !['aprovar','rejeitar'].includes(body.decision ?? '')) return NextResponse.json({ error: 'Informe actionId e decision (aprovar ou rejeitar).' }, { status: 400 });
  const result = await decideAction(body.actionId, body.decision!, getActionStore());
  return NextResponse.json(result, { status: result.status });
}
