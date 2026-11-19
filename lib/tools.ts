import type { Order } from './engine';
import { runEngine } from './engine';
import fs from 'node:fs';
import path from 'node:path';
export type Dataset = { orders: Order[]; routes?: unknown[] };
export function loadDataset(): Dataset {
  for (const file of ['data/private/snapshot_2000.json','data/demo_fallback.json']) {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(),'data',file.split('/')[1],file.split('/')[2]),'utf8')) as Dataset; } catch { /* try fallback */ }
  }
  return { orders: [] };
}
export function dashboard(dataset = loadDataset(), params = {}) { return runEngine(dataset.orders, params); }
export function executeDeterministic(toolName: string, args: Record<string, unknown>, data = loadDataset()) {
 const dashboardResult = dashboard(data);
 let impact = 0, hours = 0, approval = false, reason = '', actionExecuted = toolName;
 if (toolName === 'executar_lote_zero_touch') {
  const category = String(args.categoria ?? 'todos');
  const accepted = category === 'todos' ? ['atraso_entrega','pagamento_pendente','endereco_divergente'] : [category === 'atraso_entregue' ? 'atraso_entrega' : category];
  const rows = dashboardResult.orders.filter(o=>o.isZeroTouch && accepted.includes(o.tipo_excecao)); impact=rows.reduce((n,o)=>n+o.evRisco,0); hours=rows.length*.2; actionExecuted=`${rows.length} pedidos Zero-Touch processados`;
 } else if(toolName==='resolver_pedido_individual') {
  const row=dashboardResult.orders.find(o=>o.order_id===args.orderId); impact=row?.evRisco??0; approval=!!row?.requerAlcadaHumana; reason=approval?'Pedido exige alçada humana por VIP, valor ou ruptura.':''; actionExecuted=row?`Pedido ${row.order_id} encaminhado para ${String(args.acaoRecomendada??'resolução')}`:'Pedido não encontrado';
 } else if(toolName==='aplicar_acao_sistemica') { const anomaly=dashboardResult.systemic.find(a=>a.id===args.anomaliaId); impact=anomaly?.economiaEstimada??0; actionExecuted=anomaly?`Ação sistêmica preparada: ${anomaly.title}`:'Anomalia não encontrada'; approval=true; reason='Ação sistêmica requer validação do responsável operacional.';
 } else if(toolName==='simular_premissas_e_capacidade') { const sim=dashboard(data,{capacidadeDiaria:Number(args.capacidadeDiaria??150),probAbandonoPagamento:Number(args.probAbandonoPagamento??.3),tetoRuptura:Number(args.tetoRuptura??.4)}); impact=sim.comparison.aiFirst.evRiscoProtected; actionExecuted='Premissas e capacidade simuladas'; }
 return { actionExecuted, toolName, requiresHumanApproval:approval, approvalReason:reason, financialImpactBrl:Number(impact.toFixed(2)), hoursSaved:Number(hours.toFixed(2)), justification:`Cálculo determinístico sobre ${dashboardResult.totals.pedidos} pedidos; impacto estimado de R$ ${impact.toFixed(2)}.`, customerMessageDraft:'Olá! Estamos acompanhando sua solicitação e enviaremos uma atualização em breve.', modelUsed:'deterministic-fallback' };
}

