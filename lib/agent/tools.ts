import { createHash } from 'node:crypto';
import type { Action, ActionType } from '../actions';
import { transitionAction } from '../actions';
import { businessDaysBetween, type EnrichedOrder } from '../engine';
import { BUSINESS } from '../params';
import { dashboard, executeDeterministic, loadDataset, type Dataset } from '../tools';
import { executeActionEffect, getActionStore, recordConsultation, type ActionStore } from '../store';
import { sendZeroTouchTelegram } from '../telegram-api';
import { compareResolutionOptions } from '../resolution';
import { runCommunicationAgent, type CommunicationFacts } from './communication';
import { recordGuardrailOccurrence } from './guardrails';

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
async function persistRecord(input:{tool:string;type:ActionType;ids:string[];args:Record<string,unknown>;summary:string;calculation:Record<string,number|string|boolean|null>;system:string;simulated:boolean;needsApproval?:boolean;store:ActionStore;markOrders?:boolean;draft?:string}) {
  const id=actionId(input.tool,{...input.args,ids:[...input.ids].sort()}),now=new Date().toISOString();
  const action:Action={id,orderIds:[...input.ids].sort(),tipo:input.type,status:'proposta',responsavel:'agente',canal:'ui',impactoBrl:Number(input.calculation.evBrl??0),horasLiberadas:0,justificativa:input.summary,calculo:input.calculation,criadaEm:now,atualizadaEm:now,efeito:{tipo:input.simulated?'simulado':'real',descricao:input.summary,sistema:input.system},...(input.draft?{rascunho:input.draft}:{})};
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


function communicationFacts(row: EnrichedOrder, recommended: string): CommunicationFacts {
  return {
    marca: row.marca ?? 'GoGroup',
    status: row.data_entrega ? 'entregue com acompanhamento' : row.dias_atraso_uteis > 0 ? 'atrasado' : row.status ?? 'em acompanhamento',
    prazoDiasUteis: businessDaysBetween(BUSINESS.referenceDate, row.data_prometida_real),
    opcaoRecomendada: recommended,
  };
}

async function generateDraft(order: EnrichedOrder, motivo: string, canal: 'aprovacao' | 'zero_touch', recommended: string, store: ActionStore) {
  const communication = await runCommunicationAgent({ orderId: order.order_id, motivo, fatosDoMotor: communicationFacts(order, recommended), canal });
  if (communication.numeroNaoVerificado) await recordGuardrailOccurrence(store, 'communication:' + actionId(order.order_id, { motivo, canal }), 'N\u00famero n\u00e3o verificado removido do rascunho; usado template determin\u00edstico.');
  return communication;
}

export async function runAgentTool(name:string,args:Record<string,unknown>,data:Dataset=loadDataset(),store:ActionStore=getActionStore()) {
  const dashboardResult=await dashboard(data,{},store), rows=dashboardResult.orders;
  if(name==='listar_fila') {
    const requested=Number(args.limite??20),limit=Number.isFinite(requested)?Math.max(1,Math.min(50,Math.floor(requested))):20;
    const filter=String(args.filtro??'todos');
    const filtered=rows.filter(row=>filter==='vip'?row.isVip:filter==='zero_touch'?row.isZeroTouch:filter==='alçada'||filter==='alcada'?row.requerAlcadaHumana:filter==='categoria'?row.tipo_excecao===args.categoria:true);
    const selected=filtered.slice(0,limit).map(row=>({orderId:row.order_id,marca:row.marca,tipo:row.tipo_excecao,valorBrl:row.valor,evBrl:row.evRisco,isVip:row.isVip,requerAlcada:row.requerAlcadaHumana,zeroTouch:row.isZeroTouch,transportadora:row.transportadora,uf:row.uf,sku:row.sku}));
    const summary=`Fila priorizada pelo motor; ${selected.length} pedidos na amostra.`;const consultation=await recordConsultation(store,{tool:name,summary,orderIds:selected.map(row=>row.orderId)});
    return {summary:`Fila priorizada pelo motor; ${selected.length} pedidos na amostra.`,pedidos:selected,counts:{ativos:rows.length,vip:rows.filter(row=>row.isVip).length,alçada:rows.filter(row=>row.requerAlcadaHumana).length,zeroTouch:rows.filter(row=>row.isZeroTouch).length},consulta:consultation};
  }
  if(name==='detalhar_pedido'||name==='comparar_opcoes_resolucao'||name==='redigir_mensagem_cliente') {
    const orderId=String(args.id??''),row=rows.find(order=>order.order_id===orderId);
    if(!row)return {error:`Pedido ${orderId} não foi encontrado na fila ativa.`};
    const detail={orderId:row.order_id,marca:row.marca,tipo:row.tipo_excecao,status:row.status,valorBrl:row.valor,evBrl:row.evRisco,margemBrl:row.margem,cmvBrl:row.cmv,custoReenvioBrl:row.custo_reenvio,custoReembolsoBrl:row.custo_reembolso,perdaLtvBrl:row.perda_ltv_12m,probCancel:row.probCancel,diasAtrasoUteis:row.dias_atraso_uteis,transportadora:row.transportadora,uf:row.uf,sku:row.sku,lote:row.lote_produto,maquina:row.maquina,turno:row.turno,cd:row.cd,isVip:row.isVip,requerAlcada:row.requerAlcadaHumana};
    if(name==='detalhar_pedido') {
      const summary=`Dossie consultado pelo motor para ${row.order_id}.`;const consultation=await recordConsultation(store,{tool:name,summary,orderIds:[row.order_id]});
      return {summary:`Dossiê consultado pelo motor para ${row.order_id}.`,pedido:detail,consulta:consultation};
    }
    if(name==='comparar_opcoes_resolucao') {
      const result=compareResolutionOptions(row),consultation=await recordConsultation(store,{tool:name,summary:result.reason,orderIds:[row.order_id]});
      return {summary:result.reason,pedido:detail,...result,consulta:consultation};
    }
    const objective=String(args.objetivo??'acompanhar o pedido'),comparison=compareResolutionOptions(row);
    const communication=await generateDraft(row,objective,'aprovacao',comparison.recommended,store),owner=ownerFor(row);
    const action=await persistRecord({tool:name,type:'comunicacao_cliente',ids:[row.order_id],args:{id:row.order_id,objetivo:objective,communicationVersion:2},summary:'Rascunho de comunica\u00e7\u00e3o para '+(row.marca??'a marca')+' aguardando aprova\u00e7\u00e3o de '+owner+'.',calculation:{evBrl:row.evRisco,valorBrl:row.valor,prazoDiasUteis:communication.entradaFatos.prazoDiasUteis,recomendacao:comparison.recommended,decisor:owner,modeloComunicacao:communication.modelUsed},system:'Telegram (chat cliente de demonstra\u00e7\u00e3o)',simulated:true,needsApproval:true,draft:communication.rascunho,store});
    return {summary:'Rascunho de comunica\u00e7\u00e3o preparado; aprova\u00e7\u00e3o de '+owner+' pendente.',pedido:{orderId:row.order_id,marca:row.marca,tipo:row.tipo_excecao,objetivo:objective,requerAlcada:row.requerAlcadaHumana},comunicacao:{papel:'comunicacao',canal:'aprovacao',modelUsed:communication.modelUsed,entradaFatos:communication.entradaFatos,rascunho:communication.rascunho,validado:communication.validado},action};
  }
  if(name==='investigar_causa') {
    const causeId=String(args.id_causa??''),cause=dashboardResult.systemic.find(item=>item.id===causeId);
    if(!cause)return {error:`Causa ${causeId} não encontrada.`};
    const affected=rows.filter(row=>causeMatch(causeId,row));
    const countBy=(key:'transportadora'|'uf'|'lote_produto'|'maquina'|'turno'|'cd')=>Object.entries(affected.reduce<Record<string,number>>((groups,row)=>{const value=row[key]??'não informado';groups[String(value)]=(groups[String(value)]??0)+1;return groups;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([valor,casos])=>({valor,casos}));
    const recurringCost=affected.reduce((sum,row)=>sum+row.custo_contato,0);
    const evidence={id:cause.id,titulo:cause.title,pedidos:cause.count,gmvBrl:cause.gmvExposto,evBrl:affected.reduce((sum,row)=>sum+row.evRisco,0),economiaEstimadaBrl:cause.economiaEstimada,custoContatoRecorrenteBrl:recurringCost,transportadoras:countBy('transportadora'),rotasUf:countBy('uf'),lotes:countBy('lote_produto'),maquinas:countBy('maquina'),turnos:countBy('turno'),centrosDistribuicao:countBy('cd'),pedidoIds:affected.slice(0,8).map(row=>row.order_id),recomendacao:recommendation[causeId]??'Investigar padrão com os responsáveis da operação.'};
    const summary=`Dossie de ${cause.title} com evidencias do motor e recomendacao de processo.`;const consultation=await recordConsultation(store,{tool:name,summary,orderIds:affected.slice(0,8).map(row=>row.order_id)});
    return {summary:`Dossiê de ${cause.title} com evidências do motor e recomendação de processo.`,evidencias:evidence,consulta:consultation};
  }
  if(name==='executar_lote_zero_touch') {
    const gated=rows.filter(row=>row.isZeroTouch&&row.requerAlcadaHumana).map(row=>({orderId:row.order_id,quemDecide:ownerFor(row),motivo:row.isVip?'cliente VIP':row.tipo_excecao==='ruptura_pos_venda'?'ruptura pós-venda':'valor acima da alçada'}));
    const result=await executeDeterministic(name,{categoria:args.categoria??'todos'},data,'ui',store);
    const action=result.action as Action|undefined;
    let telegramSent=false;
    let communicationTraces: Array<Record<string,unknown>>=[];
    if(action?.status==='executada') {
      const selectedRows=rows.filter(row=>action.orderIds.includes(row.order_id));
      const brandGroups=new Map<string,EnrichedOrder[]>();
      for(const row of selectedRows) { const brand=row.marca??'GoGroup'; brandGroups.set(brand,[...(brandGroups.get(brand)??[]),row]); }
      const drafts:NonNullable<Action['rascunhos']>=[];
      const messageByBrand:Record<string,string>={};
      const traces: Array<Record<string,unknown>>=[];
      for(const [brand,orders] of brandGroups) {
        const sample=orders[0],communication=await generateDraft(sample,'acompanhar pedidos eleg\u00edveis do lote','zero_touch',sample.zeroTouchAction??'acompanhar pedido',store);
        messageByBrand[brand]=communication.rascunho;
        drafts.push({marca:brand,texto:communication.rascunho,orderIds:orders.map(order=>order.order_id)});
        traces.push({papel:'comunicacao',canal:'zero_touch',modelUsed:communication.modelUsed,entradaFatos:communication.entradaFatos,rascunho:communication.rascunho});
      }
      communicationTraces=traces;
      const withDrafts={...action,rascunhos:drafts,rascunho:drafts.map(draft=>draft.marca+': '+draft.texto).join('\n\n'),calculo:{...action.calculo,rascunhosPorMarca:JSON.stringify(messageByBrand)}};
      await store.saveAction(withDrafts);
      result.action=withDrafts;
      const delivery=await sendZeroTouchTelegram(withDrafts,selectedRows,store,messageByBrand);
      const previousSent=Number(action.calculo.telegramSentCount??0),sentCount=Math.max(previousSent,delivery.sentOrderIds.length),pendingCount=Math.max(0,action.orderIds.length-sentCount);
      telegramSent=sentCount>0;
      const updated={...withDrafts,calculo:{...withDrafts.calculo,telegramSentCount:sentCount,telegramPendingCount:pendingCount},...(telegramSent?{canal:'telegram' as const,efeito:{tipo:'real' as const,descricao:sentCount+' avisos enviados ao chat de demonstra\u00e7\u00e3o do Telegram; '+pendingCount+' pendentes. Estado em tratativa persistido.',sistema:'Telegram (canal de demonstra\u00e7\u00e3o)'}}:{})};
      if(telegramSent&&!action.calculo.telegramSentCount) await store.appendAudit({id:action.id+':telegram-notification',actionId:action.id,evento:'executada',responsavel:'agente',ocorridaEm:new Date().toISOString(),descricao:updated.efeito.descricao});
      if(delivery.configured||telegramSent) { await store.saveAction(updated); result.action=updated; }
    }
    return {summary:result.action?`Lote autônomo processado: ${result.affectedOrderIds?.length??0} pedidos movidos para em tratativa; ${telegramSent?'aviso(s) enviado(s) ao Telegram de demonstração.':'avisos externos não enviados.'}`:String(result.actionExecuted),resultado:result,gatedForHuman:gated,telegramSent,comunicacoes:communicationTraces};
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
