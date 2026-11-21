import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Order } from './engine';
import { runEngine } from './engine';
import type { Action, ActionType } from './actions';
import { transitionAction } from './actions';
import { executeActionEffect, getActionStore } from './store';
import { BUSINESS } from './params';

export type Dataset = { orders: Order[]; routes?: unknown[] };
export function loadDataset(): Dataset {
  for (const file of ['data/private/snapshot_2000.json','data/demo_fallback.json']) {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(),'data',file.split('/')[1],file.split('/')[2]),'utf8')) as Dataset; } catch { /* tenta a demo sintética */ }
  }
  return { orders: [] };
}

export async function dashboard(dataset = loadDataset(), params: Parameters<typeof runEngine>[1] = {}, store = getActionStore()) {
  const orderStates = await store.getOrderStates();
  const activeOrders = filterActiveOrders(dataset.orders, orderStates);
  const result = runEngine(activeOrders, { ...params, routes: dataset.routes as import('./engine').Route[] | undefined });
  return { ...result, orderStates };
}

export function filterActiveOrders<T extends Order>(orders: T[], states: Record<string, import('./actions').OrderState>) {
  return orders.filter(order => !states[order.order_id] || states[order.order_id] === 'aberto');
}

export async function executeDeterministic(toolName: string, args: Record<string, unknown>, data = loadDataset(), channel: Action['canal'] = 'ui', store = getActionStore()) {
  const result = await dashboard(data, {}, store);
  let rows: typeof result.orders = [], impact = 0, hours = 0, requiresHumanApproval = false;
  let type: ActionType = 'simulacao', system = 'GoGroup Ops';
  let justification = '', actionExecuted = '', customerMessageDraft = '';

  if (toolName === 'executar_lote_zero_touch') {
    const category = String(args.categoria ?? 'todos');
    const accepted = category === 'todos' ? ['atraso_entrega','pagamento_pendente','endereco_divergente'] : [category === 'atraso_entregue' ? 'atraso_entrega' : category];
    rows = result.orders.filter(order => order.isZeroTouch && !order.requerAlcadaHumana && accepted.includes(order.tipo_excecao));
    if (!rows.length) return { actionExecuted: 'Nenhum pedido elegível novo para Zero-Touch.', affectedOrderIds: [], action: null, requiresHumanApproval: false };
    impact = rows.reduce((total, order) => total + order.evRisco, 0);
    hours = rows.length * BUSINESS.minutesPerCase / 60;
    type = 'zero_touch_aviso';
    system = 'WhatsApp Business API';
    requiresHumanApproval = false;
    justification = `Lote calculado pelo motor sobre ${rows.length} pedidos elegíveis; EV agregado de R$ ${impact.toFixed(2)}.`;
    customerMessageDraft = 'Olá! Estamos acompanhando sua solicitação. Esta mensagem é uma simulação e não foi enviada.';
    actionExecuted = `Aviso de acompanhamento preparado para ${rows.length} pedidos.`;
  } else if (toolName === 'resolver_pedido_individual') {
    const row = result.orders.find(order => order.order_id === args.orderId);
    if (!row) return { error: 'Pedido não encontrado ou já fora da fila ativa.', action: null };
    rows = [row]; impact = row.evRisco; hours = BUSINESS.minutesPerCase / 60;
    const requestedAction = String(args.tipo ?? args.acaoRecomendada ?? '').toLocaleLowerCase('pt-BR');
    type = requestedAction.includes('reembolso') ? 'reembolso' : requestedAction.includes('reenvio') ? 'reenvio' : 'resolver_pedido';
    system = type === 'reembolso' || type === 'reenvio' ? 'ERP' : 'sistema de atendimento';
    requiresHumanApproval = row.requerAlcadaHumana || type === 'reembolso';
    justification = `Ação individual baseada no EV calculado de R$ ${impact.toFixed(2)} para ${row.order_id}.`;
    actionExecuted = `Ação preparada para ${row.order_id}.`;
  } else if (toolName === 'aplicar_acao_sistemica') {
    const anomaly = result.systemic.find(item => item.id === args.anomaliaId);
    if (!anomaly) return { error: 'Causa-raiz não encontrada na fila ativa.', action: null };
    rows = result.orders.filter(order => {
      if (anomaly.id === 'bug_checkout') return Boolean(order.data_prometida && order.data_prometida < order.data_prometida_real);
      if (anomaly.id === 'cd2_turno_noite') return order.tipo_excecao === 'item_faltante' && order.cd === 'CD2' && order.turno === 'noite';
      if (anomaly.id === 'rota_express_ne') return order.transportadora === 'Rota Express' && ['BA','PE','CE','RN','PB','MA','AL','PI','SE'].includes(order.uf ?? '') && ['atraso_entrega','rastreio_parado'].includes(order.tipo_excecao);
      if (anomaly.id === 'vazamento_lote_l2607b') return order.lote_produto === 'L2607-B' && order.sku === 'APC-1067' && order.tipo_excecao === 'vazamento_produto';
      if (anomaly.id === 'falha_imp02') return order.tipo_excecao === 'falha_personalizacao' && order.maquina === 'IMP-02';
      if (anomaly.id === 'avaria_carga_norte') return order.tipo_excecao === 'avaria_transporte' && order.transportadora === 'Carga Norte' && order.marca === 'Lescent';
      if (anomaly.id === 'ruptura_kokeshi') return order.tipo_excecao === 'ruptura_pos_venda' && (order.sku ?? '').startsWith('KSH-');
      return false;
    });
    impact = anomaly.economiaEstimada; type = anomaly.id === 'vazamento_lote_l2607b' ? 'bloqueio_lote' : anomaly.id === 'rota_express_ne' ? 'chamado_transportadora' : 'reenvio';
    system = type === 'bloqueio_lote' ? 'ERP' : 'painel da transportadora';
    requiresHumanApproval = true;
    justification = `Ação estrutural proposta para ${anomaly.title}; economia estimada de R$ ${impact.toFixed(2)} calculada pelo motor.`;
    actionExecuted = `Plano preparado para a causa-raiz: ${anomaly.title}.`;
  } else if (toolName === 'simular_premissas_e_capacidade') {
    const simulation = runEngine(data.orders, { capacidadeDiaria: Number(args.capacidadeDiaria ?? BUSINESS.dailyCapacity), probAbandonoPagamento: Number(args.probAbandonoPagamento ?? BUSINESS.paymentAbandonmentProbability), tetoRuptura: Number(args.tetoRuptura ?? BUSINESS.stockoutRiskFloor) });
    impact = simulation.comparison.aiFirst.evRiscoProtected;
    justification = `Simulação do motor determinístico para ${simulation.totals.pedidos} pedidos.`;
    actionExecuted = 'Simulação registrada.';
  } else return { error: `Ferramenta desconhecida: ${toolName}`, action: null };

  const orderIds = rows.map(order => order.order_id).sort();
  const id = createHash('sha256').update(`${toolName}|${type}|${orderIds.join('|') || JSON.stringify(args)}`).digest('hex').slice(0, 24);
  const now = new Date().toISOString();
  const action: Action = { id, orderIds, tipo: type, status: 'proposta', responsavel: 'agente', canal: channel, impactoBrl: impact, horasLiberadas: hours, justificativa: justification, calculo: { pedidos: orderIds.length, evBrl: impact, capacidadeDiaria: result.params.capacidadeDiaria }, criadaEm: now, atualizadaEm: now, efeito: { tipo: 'simulado', descricao: 'Registro da ação e atualização do estado no GoGroup Ops; comunicação ou alteração no sistema externo ainda é simulada.', sistema: system } };
  const created = await store.createAction(action);
  if (!created.created) return { actionExecuted: actionExecuted, action: created.action, requiresHumanApproval: created.action.status === 'aguardando_aprovacao', affectedOrderIds: created.action.orderIds, financialImpactBrl: created.action.impactoBrl, hoursSaved: created.action.horasLiberadas, customerMessageDraft };
  await store.appendAudit({ id: `${id}:criada`, actionId: id, evento: 'criada', responsavel: 'agente', ocorridaEm: now, descricao: justification });
  const awaiting = transitionAction(action, 'aguardando_aprovacao', 'agente');
  await store.saveAction(awaiting);
  if (requiresHumanApproval) return { actionExecuted, action: awaiting, requiresHumanApproval, affectedOrderIds: orderIds, financialImpactBrl: impact, hoursSaved: hours, customerMessageDraft };
  const approved = transitionAction(awaiting, 'aprovada', 'agente');
  await store.saveAction(approved);
  await store.appendAudit({ id: `${id}:aprovada`, actionId: id, evento: 'aprovada', responsavel: 'agente', ocorridaEm: approved.atualizadaEm, descricao: 'Ação elegível à alçada autônoma determinística.' });
  const executed = await executeActionEffect(approved, store);
  return { actionExecuted: type === 'zero_touch_aviso' ? `Aviso enviado (simulado) para ${orderIds.length} pedidos.` : actionExecuted, action: executed, requiresHumanApproval: false, affectedOrderIds: orderIds, financialImpactBrl: impact, hoursSaved: hours, customerMessageDraft };
}
