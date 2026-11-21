import { createHash } from 'node:crypto';
import type { Action, ActionType } from '../actions';
import { transitionAction } from '../actions';
import type { EnrichedOrder } from '../engine';
import { BUSINESS } from '../params';
import { dashboard, executeDeterministic, loadDataset, type Dataset } from '../tools';
import { executeActionEffect, getActionStore, type ActionStore } from '../store';
import { sendZeroTouchTelegram } from '../telegram-api';
import { compareResolutionOptions } from '../resolution';

const recommendation: Record<string,string> = {
  bug_checkout: 'Corrigir o cálculo de promessa e monitorar os pedidos afetados.', cd2_turno_noite: 'Auditar conferência e separação de brindes no CD2 à noite.',
  rota_express_ne: 'Revisar capacidade e SLA da rota Nordeste com a transportadora.', vazamento_lote_l2607b: 'Conter lote e inspecionar o SKU afetado.',
  falha_imp02: 'Calibrar a IMP-02 e revisar a rotina de personalização.', avaria_carga_norte: 'Investigar acondicionamento e transporte dos itens Lescent.', ruptura_kokeshi: 'Revisar previsão e disponibilidade do SKU Kokeshi.',
};

const causeMatch = (id:string, order:EnrichedOrder) => {
  if(id==='bug_checkout') return Boolean(order.data_prometida&&order.data_prometida<order.data_prometida_real);
  if(id==='cd2_turno_noite') return order.tipo_excecao==='item_faltante'&&order.cd==='CD2'&&order.turno==='noite';
  if(id==='rota_express_ne') return order.transportadora==='Rota Express'&&['BA','PE','CE','RN','PB','MA','AL','PI','SE'].includes(order.uf??'')&&['atraso_entrega','rastreio_parado'].includes(order.tipo_excecao);
  if(id==='vazamento_lote_l2607b') return order.tipo_excecao==='vazamento_produto'&&order.lote_produto==='L2607-B'&&order.sku==='APC-1067';
  if(id==='falha_imp02') return order.tipo_excecao==='falha_personalizacao'&&order.maquina==='IMP-02';
  if(id==='avaria_carga_norte') return order.tipo_excecao==='avaria_transporte'&&order.transportadora==='Carga Norte'&&order.marca==='Lescent';
  if(id==='ruptura_kokeshi') return order.tipo_excecao==='ruptura_pos_venda'&&(order.sku??'').startsWith('KSH-');
  return false;
};

function actionId(tool:string, data:unknown) { return createHash('sha256').update(`${tool}|${JSON.stringify(data)}`).digest('hex').slice(0,24); }
async function persistRecord(input:{tool:string;type:ActionType;ids:string[];args:Record<string,unknown>;summary:string;calculation:Record<string,number|string|boolean|null>;system:string;simulated:boolean;needsApproval?:boolean;store:ActionStore;markOrders?:boolean}) {
  const id=actionId(input.tool,{...input.args,ids:[...input.ids].sort()}),now=new Date().toISOString();
  const action:Action={id,orderIds:[...input.ids].sort(),tipo:input.type,status:'proposta',responsavel:'agente',canal:'ui',impactoBrl:Number(input.calculation.evBrl??0),horasLiberadas:0,justificativa:input.summary,calculo:input.calculation,criadaEm:now,atualizadaEm:now,efeito:{tipo:input.simulated?'simulado':'real',descricao:input.summary,sistema:input.system}};
  const created=await input.store.createAction(action);
  if(!created.created)return created.action;
  await input.store.appendAudit({id:`${id}:criada`,actionId:id,evento:'criada',responsavel:'agente',ocorridaEm:now,descricao:input.summary});
  const waiting=transitionAction(action,'aguardando_aprovacao','agente');await input.store.saveAction(waiting);
  if(input.needsApproval)return waiting;
  const approved=transitionAction(waiting,'aprovada','agente');await input.store.saveAction(approved);
  await input.store.appendAudit({id:`${id}:aprovada`,actionId:id,evento:'aprovada',responsavel:'agente',ocorridaEm:approved.atualizadaEm,descricao:'Registro de análise/autonomia sem ação humana externa.'});
  return executeActionEffect(approved,input.store);
}

function ownerFor(row:EnrichedOrder) {
  if(row.isVip)return BUSINESS.approvalOwners.vip;
  if(row.tipo_excecao==='ruptura_pos_venda')return BUSINESS.approvalOwners.stockout;
  if(row.tipo_excecao==='vazamento_produto'||row.tipo_excecao==='falha_personalizacao')return BUSINESS.approvalOwners.technical;
  if(row.cd==='CD2')return BUSINESS.approvalOwners.distributionCenter;
  if(row.valor>BUSINESS.approvalValueThreshold)return BUSINESS.approvalOwners.highValue;
  return BUSINESS.approvalOwners.systemic;
}

export async function runAgentTool(name:string,args:Record<string,unknown>,data:Dataset=loadDataset(),store:ActionStore=getActionStore()) {
  const dashboardResult=await dashboard(data,{},store), rows=dashboardResult.orders;
  if(name==='listar_fila') {
    const requested=Number(args.limite??20),limit=Number.isFinite(requested)?Math.max(1,Math.min(50,Math.floor(requested))):20;
    const filter=String(args.filtro??'todos');
    const filtered=rows.filter(row=>filter==='vip'?row.isVip:filter==='zero_touch'?row.isZeroTouch:filter==='alçada'||filter==='alcada'?row.requerAlcadaHumana:filter==='categoria'?row.tipo_excecao===args.categoria:true);
    const selected=filtered.slice(0,limit).map(row=>({orderId:row.order_id,marca:row.marca,tipo:row.tipo_excecao,valorBrl:row.valor,evBrl:row.evRisco,isVip:row.isVip,requerAlcada:row.requerAlcadaHumana,zeroTouch:row.isZeroTouch,transportadora:row.transportadora,uf:row.uf,sku:row.sku}));
    const action=await persistRecord({tool:name,type:'consulta_fila',ids:selected.map(row=>row.orderId),args:{limit,filter,categoria:args.categoria as string},summary:`Consulta persistida da fila priorizada: ${selected.length} pedidos retornados.`,calculation:{pedidos:selected.length,evBrl:selected.reduce((sum,row)=>sum+row.evBrl,0)},system:'GoGroup Ops',simulated:false,store});
    return {summary:`Fila priorizada pelo motor; ${selected.length} pedidos na amostra.`,pedidos:selected,counts:{ativos:rows.length,vip:rows.filter(row=>row.isVip).length,alçada:rows.filter(row=>row.requerAlcadaHumana).length,zeroTouch:rows.filter(row=>row.isZeroTouch).length},action};
  }
  if(name==='detalhar_pedido'||name==='comparar_opcoes_resolucao'||name==='redigir_mensagem_cliente') {
    const orderId=String(args.id??''),row=rows.find(order=>order.order_id===orderId);
    if(!row)return {error:`Pedido ${orderId} não foi encontrado na fila ativa.`};
    const detail={orderId:row.order_id,marca:row.marca,tipo:row.tipo_excecao,status:row.status,valorBrl:row.valor,evBrl:row.evRisco,margemBrl:row.margem,cmvBrl:row.cmv,custoReenvioBrl:row.custo_reenvio,custoReembolsoBrl:row.custo_reembolso,perdaLtvBrl:row.perda_ltv_12m,probCancel:row.probCancel,diasAtrasoUteis:row.dias_atraso_uteis,transportadora:row.transportadora,uf:row.uf,sku:row.sku,lote:row.lote_produto,maquina:row.maquina,turno:row.turno,cd:row.cd,isVip:row.isVip,requerAlcada:row.requerAlcadaHumana};
    if(name==='detalhar_pedido') {
      const action=await persistRecord({tool:name,type:'investigacao',ids:[row.order_id],args:{id:row.order_id},summary:`Dossiê determinístico consultado para ${row.order_id}.`,calculation:{evBrl:row.evRisco,valorBrl:row.valor,perdaLtvBrl:row.perda_ltv_12m},system:'GoGroup Ops',simulated:false,store});
      return {summary:`Dossiê consultado pelo motor para ${row.order_id}.`,pedido:detail,action};
    }
    if(name==='comparar_opcoes_resolucao') {
      const result=compareResolutionOptions(row),action=await persistRecord({tool:name,type:'comparacao',ids:[row.order_id],args:{id:row.order_id},summary:result.reason,calculation:{evBrl:row.evRisco,valorPagoBrl:row.valor,reenvioBrl:result.options[0].costBrl,reembolsoBrl:result.options[1].costBrl,aguardarBrl:result.options[2].costBrl,perdaLtvBrl:row.perda_ltv_12m,recomendacao:result.recommended},system:'GoGroup Ops',simulated:false,store});
      return {summary:result.reason,pedido:detail,...result,action};
    }
    const objective=String(args.objetivo??'atualizar o andamento');
    const action=await persistRecord({tool:name,type:'comunicacao_cliente',ids:[row.order_id],args:{id:row.order_id,objetivo:objective},summary:`Rascunho de mensagem preparado para ${row.marca??'a marca'}; objective: ${objective}.`,calculation:{evBrl:row.evRisco,valorBrl:row.valor},system:'WhatsApp Business API',simulated:true,store});
    return {summary:'Contexto e política para rascunho de comunicação.',pedido:{orderId:row.order_id,marca:row.marca,tipo:row.tipo_excecao,objetivo:objective,requerAlcada:row.requerAlcadaHumana},policy:['Tom empático e direto.','Não prometa prazo, reembolso ou resolução sem autorização.','Não inclua valor ou prazo que não esteja no dossiê.'],action};
  }
  if(name==='investigar_causa') {
    const causeId=String(args.id_causa??''),cause=dashboardResult.systemic.find(item=>item.id===causeId);
    if(!cause)return {error:`Causa ${causeId} não encontrada.`};
    const affected=rows.filter(row=>causeMatch(causeId,row));
    const countBy=(key:'transportadora'|'uf'|'lote_produto'|'maquina'|'turno'|'cd')=>Object.entries(affected.reduce<Record<string,number>>((groups,row)=>{const value=row[key]??'não informado';groups[String(value)]=(groups[String(value)]??0)+1;return groups;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([valor,casos])=>({valor,casos}));
    const recurringCost=affected.reduce((sum,row)=>sum+row.custo_contato,0);
    const evidence={id:cause.id,titulo:cause.title,pedidos:cause.count,gmvBrl:cause.gmvExposto,evBrl:affected.reduce((sum,row)=>sum+row.evRisco,0),economiaEstimadaBrl:cause.economiaEstimada,custoContatoRecorrenteBrl:recurringCost,transportadoras:countBy('transportadora'),rotasUf:countBy('uf'),lotes:countBy('lote_produto'),maquinas:countBy('maquina'),turnos:countBy('turno'),centrosDistribuicao:countBy('cd'),pedidoIds:affected.slice(0,8).map(row=>row.order_id),recomendacao:recommendation[causeId]??'Investigar padrão com os responsáveis da operação.'};
    const action=await persistRecord({tool:name,type:'investigacao',ids:affected.slice(0,8).map(row=>row.order_id),args:{id_causa:causeId},summary:`Dossiê de causa-raiz ${cause.title} persistido.`,calculation:{pedidos:cause.count,gmvBrl:cause.gmvExposto,evBrl:evidence.evBrl,economiaEstimadaBrl:cause.economiaEstimada,custoContatoRecorrenteBrl:recurringCost},system:'GoGroup Ops',simulated:false,store});
    return {summary:`Dossiê de ${cause.title} com evidências do motor e recomendação de processo.`,evidencias:evidence,action};
  }
  if(name==='executar_lote_zero_touch') {
    const gated=rows.filter(row=>row.isZeroTouch&&row.requerAlcadaHumana).map(row=>({orderId:row.order_id,quemDecide:ownerFor(row),motivo:row.isVip?'cliente VIP':row.tipo_excecao==='ruptura_pos_venda'?'ruptura pós-venda':'valor acima da alçada'}));
    const result=await executeDeterministic(name,{categoria:args.categoria??'todos'},data,'ui',store);
    const action=result.action as Action|undefined;
    let telegramSent=false;
    if(action?.status==='executada') {
      const delivery=await sendZeroTouchTelegram(action,rows.filter(row=>action.orderIds.includes(row.order_id)),store);
      const previousSent=Number(action.calculo.telegramSentCount??0),sentCount=Math.max(previousSent,delivery.sentOrderIds.length),pendingCount=Math.max(0,action.orderIds.length-sentCount);
      telegramSent=sentCount>0;
      const updated={...action,calculo:{...action.calculo,telegramSentCount:sentCount,telegramPendingCount:pendingCount},...(telegramSent?{canal:'telegram' as const,efeito:{tipo:'real' as const,descricao:`${sentCount} avisos enviados ao chat de demonstração do Telegram; ${pendingCount} pendentes. Estado em tratativa persistido.`,sistema:'Telegram (canal de demonstração)'}}:{})};
      if(telegramSent&&!action.calculo.telegramSentCount) await store.appendAudit({id:`${action.id}:telegram-notification`,actionId:action.id,evento:'executada',responsavel:'agente',ocorridaEm:new Date().toISOString(),descricao:updated.efeito.descricao});
      if(delivery.configured||telegramSent) { await store.saveAction(updated); result.action=updated; }
    }
    return {summary:result.action?`Lote autônomo processado: ${result.affectedOrderIds?.length??0} pedidos movidos para em tratativa; ${telegramSent?'aviso(s) enviado(s) ao Telegram de demonstração.':'avisos externos não enviados.'}`:String(result.actionExecuted),resultado:result,gatedForHuman:gated,telegramSent};
  }
  if(name==='abrir_chamado_transportadora') {
    const carrier=String(args.transportadora??''),requested=Array.isArray(args.pedidos)?args.pedidos.map(String):[];
    const affected=rows.filter(row=>row.transportadora===carrier&&(!requested.length||requested.includes(row.order_id)));
    const orderIds=affected.map(row=>row.order_id),sla=affected.map(row=>Number(row.sla_contratado_dias_uteis??0)).filter(Number.isFinite);
    const action=await persistRecord({tool:name,type:'chamado_transportadora',ids:orderIds,args:{transportadora:carrier},summary:`Chamado para ${carrier} preparado para aprovação humana com ${orderIds.length} pedidos e evidências de rota.`,calculation:{pedidos:orderIds.length,evBrl:affected.reduce((sum,row)=>sum+row.evRisco,0),slaMinimoDiasUteis:sla.length?Math.min(...sla):0,slaMaximoDiasUteis:sla.length?Math.max(...sla):0,decisor:BUSINESS.approvalOwners.systemic,recomendacao:`Abrir chamado sobre SLA e rota com ${carrier}.`},system:'painel da transportadora',simulated:true,needsApproval:true,store});
    return {summary:`Chamado ${carrier} registrado como ação pendente de aprovação; nenhum chamado externo foi enviado.`,transportadora:carrier,pedidoIds:orderIds.slice(0,25),evidenciaSla:{menorDiasUteis:sla.length?Math.min(...sla):null,maiorDiasUteis:sla.length?Math.max(...sla):null},action};
  }
  if(name==='escalar_para_humano') {
    const orderId=String(args.id??''),row=rows.find(order=>order.order_id===orderId);
    if(!row)return {error:`Pedido ${orderId} não encontrado na fila ativa.`};
    const costs=compareResolutionOptions(row),confidence=String(args.confianca??'alta'),requestedConfidence=(['baixa','media','alta'].includes(confidence)?confidence:'alta'),reason=String(args.motivo??'Revisão humana solicitada'),owner=ownerFor(row);
    const options=costs.options.map(option=>`${option.option}: R$ ${option.costBrl.toFixed(2)}`);
    const action=await persistRecord({tool:name,type:'escalonamento',ids:[row.order_id],args:{id:row.order_id,reason,owner,requestedConfidence},summary:`${reason} Recomendo ${costs.recommended}; decisão de ${owner}.`,calculation:{evBrl:row.evRisco,valorPagoBrl:row.valor,reenvioBrl:costs.options[0].costBrl,reembolsoBrl:costs.options[1].costBrl,aguardarBrl:costs.options[2].costBrl,perdaLtvBrl:row.perda_ltv_12m,recomendacao:costs.recommended,motivo:reason,decisor:owner,confianca:requestedConfidence,opcoes:options.join(' | ')},system:'GoGroup Ops; ERP após aprovação',simulated:true,needsApproval:true,store});
    return {summary:`Escalonado para ${owner}; ação aguardando aprovação humana.`,motivo:reason,decisor:owner,confianca:requestedConfidence,opcoesCalculadas:costs,opcoesSolicitadas:options,action};
  }
  return {error:`Ferramenta não reconhecida: ${name}`};
}

export function getApprovalOwner(row:EnrichedOrder) { return ownerFor(row); }
