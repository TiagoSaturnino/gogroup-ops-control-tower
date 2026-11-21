import type { ActionStore } from '../store';
import { getActionStore } from '../store';
import type { Dataset } from '../tools';
import { dashboard, loadDataset } from '../tools';
import { getApprovalOwner, runAgentTool } from './tools';
import type { AgentLoopResult, AgentStep } from './loop';
import { TOOL_ROLE, type AgentRole } from './roles';

function traceTool(steps:AgentStep[],round:number,name:string,args:Record<string,unknown>,result:unknown,role:AgentRole=TOOL_ROLE[name]??'orquestrador') {
  steps.push({round,papel:role,pensamentoResumido:`${role}: consultei ${name} com evidência do motor para avançar a rotina.`,tool:name,argumentos:args,resultado:result});
  return result as Record<string,unknown>;
}

export async function deterministicFallback(message:string,data:Dataset=loadDataset(),store:ActionStore=getActionStore(),priorSteps:AgentStep[]=[]):Promise<AgentLoopResult> {
  const steps=[...priorSteps];
  const run=async(round:number,name:string,args:Record<string,unknown>)=>traceTool(steps,round,name,args,await runAgentTool(name,args,data,store));
  if(/plano.*hoje|monte.*plano|plano de hoje/i.test(message)) {
    const queue=await run(1,'listar_fila',{limite:50,filtro:'todos'});
    await run(2,'executar_lote_zero_touch',{categoria:'todos'});
    const dashboardResult=await dashboard(data,{},store);
    const candidates=dashboardResult.rankedOrders.filter(row=>row.requerAlcadaHumana).slice(0,2);
    const comparisons=[] as {row:typeof candidates[number];result:Record<string,unknown>}[];
    for(const row of candidates)comparisons.push({row,result:await run(3,'comparar_opcoes_resolucao',{id:row.order_id})});
    for(const {row,result} of comparisons) {
      const recommendation=String(result.recommended??'aguardar');
      await run(4,'escalar_para_humano',{id:row.order_id,motivo:row.isVip?'Cliente VIP requer alçada humana.':'Pedido requer alçada humana por valor ou tipo de exceção.',quem_deve_decidir:getApprovalOwner(row),opcoes:['reenvio','reembolso','aguardar'],confianca:'alta',recomendacao:recommendation});
    }
    const investigation=await run(5,'investigar_causa',{id_causa:'rota_express_ne'});
    const evidence=(investigation.evidencias??{}) as {pedidoIds?:string[]};
    await run(6,'abrir_chamado_transportadora',{transportadora:'Rota Express',pedidos:evidence.pedidoIds??(queue.pedidos as {orderId:string;transportadora?:string}[]).filter(row=>row.transportadora==='Rota Express').map(row=>row.orderId)});
    return {modelUsed:'deterministic',text:'Plano de hoje montado: fila priorizada, Zero-Touch processado para pedidos autônomos, casos de alçada escalados, dossiê da Rota Express registrado e chamado aguardando aprovação.',steps,guardrailTriggered:false};
  }
  if(/\bcausas\b|causa-raiz/i.test(message)) {
    const result=await dashboard(data,{},store);
    for(let index=0;index<result.systemic.length;index++) await run((index%6)+1,'investigar_causa',{id_causa:result.systemic[index].id});
    return {modelUsed:'deterministic',text:`Investiguei ${result.systemic.length} causas-raiz atuais do motor com custo recorrente e evidências.`,steps,guardrailTriggered:false};
  }
  if(/\bfila\b|pedidos ativos/i.test(message)) {
    const limit=Number(message.match(/limite\s+(\d+)/i)?.[1]??20);
    await run(1,'listar_fila',{limite:Number.isFinite(limit)?limit:20,filtro:'todos'});
    return {modelUsed:'deterministic',text:'Fila priorizada pelo EV_Risco consultada; não executei ações.',steps,guardrailTriggered:false};
  }
  const route=/rota express|transportadora/i.test(message), lot=/l2607-b|lote/i.test(message), id=message.match(/\b(?:GC|GB)-?[A-Z0-9-]+\b/i)?.[0]?.replace(/^(GC|GB)(?!-)/,'$1-');
  if(route) {
    const investigation=await run(1,'investigar_causa',{id_causa:'rota_express_ne'}), evidence=(investigation.evidencias??{}) as {pedidoIds?:string[]};
    await run(2,'abrir_chamado_transportadora',{transportadora:'Rota Express',pedidos:evidence.pedidoIds??[]});
  } else if(lot) await run(1,'investigar_causa',{id_causa:'vazamento_lote_l2607b'});
  else if(id) {
    await run(1,'detalhar_pedido',{id});
    await run(2,'comparar_opcoes_resolucao',{id});
    const dashboardResult=await dashboard(data,{},store),row=dashboardResult.rankedOrders.find(order=>order.order_id===id);
    if(row&&(row.requerAlcadaHumana||/baixa confiança|incerto|não tenho certeza/i.test(message)))await run(3,'escalar_para_humano',{id,motivo:row.requerAlcadaHumana?'Alçada exigida pelas regras do motor.':'Confiança baixa na resolução sem evidência suficiente.',quem_deve_decidir:getApprovalOwner(row),opcoes:['reenvio','reembolso','aguardar'],confianca:row.requerAlcadaHumana?'alta':'baixa'});
  } else {
    await run(1,'listar_fila',{limite:20,filtro:'todos'});
    await run(2,'executar_lote_zero_touch',{categoria:'todos'});
  }
  return {modelUsed:'deterministic',text:'Consultei os dados e registrei as ações possíveis no store. Veja a trilha para evidências, aprovações pendentes e efeitos simulados.',steps,guardrailTriggered:false};
}
