import { NextResponse } from 'next/server';
import { transitionAction } from '@/lib/actions';
import { executeActionEffect, getActionStore } from '@/lib/store';

export async function GET() {
  const store = getActionStore();
  const [actions, audit, orderStates] = await Promise.all([store.listActions(), store.listAudit(), store.getOrderStates()]);
  return NextResponse.json({ actions, audit, orderStates, store: store.kind });
}

export async function POST(request: Request) {
  let body: { actionId?: string; decision?: 'aprovar' | 'rejeitar' };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }
  if (!body.actionId || !['aprovar','rejeitar'].includes(body.decision ?? '')) return NextResponse.json({ error: 'Informe actionId e decision (aprovar ou rejeitar).' }, { status: 400 });
  const store = getActionStore(), action = await store.getAction(body.actionId);
  if (!action) return NextResponse.json({ error: 'Ação não encontrada.' }, { status: 404 });
  if (action.status === 'aprovada' && body.decision === 'aprovar') {
    try { return NextResponse.json({ action: await executeActionEffect(action, store) }); }
    catch { return NextResponse.json({ error: 'Aprovação foi persistida, mas o efeito interno falhou. Tente aprovar novamente para retomar.' }, { status: 503 }); }
  }
  if (action.status !== 'aguardando_aprovacao') return NextResponse.json({ error: 'A ação já saiu da etapa de aprovação.', action }, { status: 409 });
  const approved = body.decision === 'aprovar', now = new Date().toISOString();
  const updated = transitionAction(action, approved ? 'aprovada' : 'rejeitada', 'humano');
  await store.saveAction(updated);
  await store.appendAudit({ id: `${action.id}:${approved ? 'aprovada' : 'rejeitada'}`, actionId: action.id, evento: approved ? 'aprovada' : 'rejeitada', responsavel: 'humano', ocorridaEm: now, descricao: approved ? 'Aprovação humana registrada.' : 'Rejeição humana registrada.' });
  let result = updated;
  if (approved) {
    try { result = await executeActionEffect(updated, store); }
    catch { return NextResponse.json({ error: 'Aprovação foi persistida, mas o efeito interno falhou. Tente aprovar novamente para retomar.', action: updated }, { status: 503 }); }
  }
  return NextResponse.json({ action: result });
}
