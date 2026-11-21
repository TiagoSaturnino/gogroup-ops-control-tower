import type { Order } from './engine';
import { runEngine } from './engine';
import fs from 'node:fs';
import path from 'node:path';
import { BUSINESS } from './params';
export type Dataset = { orders: Order[]; routes?: unknown[] };
export function loadDataset(): Dataset {
  for (const file of ['data/private/snapshot_2000.json','data/demo_fallback.json']) {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(),'data',file.split('/')[1],file.split('/')[2]),'utf8')) as Dataset; } catch { /* try fallback */ }
  }
  return { orders: [] };
}
export function dashboard(dataset = loadDataset(), params = {}) { return runEngine(dataset.orders, { ...params, routes: dataset.routes as import('./engine').Route[] | undefined }); }
export function executeDeterministic(toolName: string, args: Record<string, unknown>, data = loadDataset()) {
  const dashboardResult = dashboard(data);
 let impact = 0, hours = 0, approval = false, reason = '', actionExecuted = toolName;
 let affectedOrderIds: string[] = []; let sublots: { category: string; count: number; orderIds: string[]; template: string }[] = [];
 if (toolName === 'executar_lote_zero_touch') {
  const category = String(args.categoria ?? 'todos');
  const accepted = category === 'todos' ? ['atraso_entrega','pagamento_pendente','endereco_divergente'] : [category === 'atraso_entregue' ? 'atraso_entrega' : category];
  const rows = dashboardResult.orders.filter(o=>o.isZeroTouch && accepted.includes(o.tipo_excecao)); affectedOrderIds=rows.map(o=>o.order_id); impact=rows.reduce((n,o)=>n+o.evRisco,0); hours=rows.length*BUSINESS.minutesPerCase/60; actionExecuted=`Lote preparado para ${rows.length} pedidos Zero-Touch (sem envio externo)`;
  const definitions=[['atraso_entrega','atraso_entregue','Ol\u00e1! Seu pedido j\u00e1 foi entregue. Encerramos o acompanhamento do atraso e agradecemos por comprar com a gente.'],['pagamento_pendente','pagamento_pendente','Ol\u00e1! Seu pedido est\u00e1 aguardando a confirma\u00e7\u00e3o do pagamento. Se j\u00e1 pagou, pode desconsiderar esta mensagem; caso contr\u00e1rio, conclua pelo link seguro do pedido.'],['endereco_divergente','endereco_divergente','Ol\u00e1! Precisamos confirmar o endere\u00e7o de entrega do seu pedido. Responda esta mensagem com o endere\u00e7o completo para evitarmos problemas no envio.']] as const;
  sublots=definitions.map(([type,category,template])=>{const subset=rows.filter(o=>o.tipo_excecao===type);return {category,count:subset.length,orderIds:subset.map(o=>o.order_id),template};});
 } else if(toolName==='resolver_pedido_individual') {
  const row=dashboardResult.orders.find(o=>o.order_id===args.orderId); impact=row?.evRisco??0; approval=!!row?.requerAlcadaHumana; reason=approval?'Pedido exige alçada humana por VIP, valor ou ruptura.':''; actionExecuted=row?`Ação preparada para o pedido ${row.order_id}; nenhuma alteração foi persistida`:'Pedido não encontrado';
 } else if(toolName==='aplicar_acao_sistemica') { const anomaly=dashboardResult.systemic.find(a=>a.id===args.anomaliaId); impact=anomaly?.economiaEstimada??0; actionExecuted=anomaly?`Ação sistêmica preparada: ${anomaly.title}`:'Anomalia não encontrada'; approval=true; reason='Ação sistêmica requer validação do responsável operacional.';
 } else if(toolName==='simular_premissas_e_capacidade') { const sim=dashboard(data,{capacidadeDiaria:Number(args.capacidadeDiaria??BUSINESS.dailyCapacity),probAbandonoPagamento:Number(args.probAbandonoPagamento??BUSINESS.paymentAbandonmentProbability),tetoRuptura:Number(args.tetoRuptura??BUSINESS.stockoutRiskFloor)}); impact=sim.comparison.aiFirst.evRiscoProtected; actionExecuted='Premissas e capacidade simuladas'; }
 const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
 return { actionExecuted, toolName, requiresHumanApproval:approval, approvalReason:reason, financialImpactBrl:Number(impact.toFixed(2)), hoursSaved:Number(hours.toFixed(2)), affectedOrderIds, sublots, justification:`C\u00e1lculo determin\u00edstico sobre ${dashboardResult.totals.pedidos} pedidos; impacto estimado de ${brl.format(impact)}.`, customerMessageDraft:sublots[0]?.template ?? 'Ol\u00e1! Estamos acompanhando sua solicita\u00e7\u00e3o e enviaremos uma atualiza\u00e7\u00e3o em breve.', modelUsed:'deterministic-fallback' };
}

