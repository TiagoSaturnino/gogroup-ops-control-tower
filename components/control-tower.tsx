"use client";

import { useCallback, useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Activity, Check, FileUp, ShieldCheck, Upload, X } from 'lucide-react';
import type { Order } from '@/lib/engine';
import { BUSINESS } from '@/lib/params';
import { KPIs } from './KPIs';
import { Fila } from './Fila';
import { CausasRaiz } from './CausasRaiz';
import { AgentePainel } from './AgentePainel';
import { Auditoria } from './Auditoria';
import type { ActionHistory, AuditRecord, Dashboard, EnrichedOrder } from './control-types';

const statuses = { em_analise: 1, aberta: 2, aguardando_transportadora: 3, aguardando_cliente: 4 };
type AgentStep = { round: number; papel: string; pensamentoResumido: string; tool: string; argumentos: Record<string, unknown>; resultado: unknown };
type AgentResponse = { actions?: ActionHistory[]; audit?: AuditRecord[]; error?: string; modelUsed?: string; text?: string; steps?: AgentStep[] };

export function ControlTower() {
  const [data,setData]=useState<Dashboard|null>(null),[actions,setActions]=useState<ActionHistory[]>([]),[audit,setAudit]=useState<AuditRecord[]>([]),[storeKind,setStoreKind]=useState('memory');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[toast,setToast]=useState(''),[agentSteps,setAgentSteps]=useState<AgentStep[]>([]),[agentText,setAgentText]=useState(''),[capacity,setCapacity]=useState<number>(BUSINESS.dailyCapacity),[abandonment,setAbandonment]=useState(BUSINESS.paymentAbandonmentProbability*100),[rupture,setRupture]=useState(BUSINESS.stockoutRiskFloor*100);
  const [source,setSource]=useState<'snapshot'|'csv'>('snapshot'),[uploadOpen,setUploadOpen]=useState(false),[methodologyOpen,setMethodologyOpen]=useState(false),[selected,setSelected]=useState<EnrichedOrder|null>(null);

  const loadActions=useCallback(async()=>{
    const response=await fetch('/api/actions',{cache:'no-store'});
    if(!response.ok)throw new Error('Não foi possível carregar ações persistidas.');
    const payload=await response.json() as {actions:ActionHistory[];audit:AuditRecord[];store:string};
    setActions(payload.actions);setAudit(payload.audit);setStoreKind(payload.store);
  },[]);
  const load=useCallback(async(params?:{capacidade?:number;probAbandono?:number;tetoRuptura?:number})=>{
    setLoading(true);
    try{
      const query=new URLSearchParams(Object.entries(params??{}).map(([key,value])=>[key,String(value)]));
      const [operation]=await Promise.all([fetch(`/api/operations${query.size?`?${query}`:''}`,{cache:'no-store'}),loadActions()]);
      if(!operation.ok)throw new Error('Não foi possível carregar a operação.');
      setData(await operation.json() as Dashboard);
    }catch(error){setToast(error instanceof Error?error.message:'Falha ao carregar dados.');}
    finally{setLoading(false);}
  },[loadActions]);
  useEffect(()=>{void load();},[load]); // eslint-disable-line react-hooks/set-state-in-effect

  const sendAction=async(message:string,toolName?:string,args?:Record<string,unknown>)=>{
    setBusy(true);
    try{
      const response=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,toolName,args})});
      const payload=await response.json() as AgentResponse;
      if(!response.ok)throw new Error(payload.error??'O agente não conseguiu preparar a ação.');
      setAgentSteps(payload.steps??[]);setAgentText(payload.text??'');
      if(payload.actions){setActions(payload.actions);if(payload.audit)setAudit(payload.audit);}
      setToast(payload.text??'Trilha do agente atualizada.');
      await load();
    }catch(error){setToast(error instanceof Error?error.message:'Falha ao acionar o agente.');}
    finally{setBusy(false);}
  };
  const decideAction=async(actionId:string,decision:'aprovar'|'rejeitar')=>{
    setBusy(true);
    try{
      const response=await fetch('/api/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actionId,decision})});
      const payload=await response.json() as {action?:ActionHistory;error?:string};
      if(!response.ok)throw new Error(payload.error??'Não foi possível registrar a decisão.');
      setToast(decision==='aprovar'?'Aprovação persistida; efeito externo continua simulado.':'Rejeição persistida.');
      await load();
    }catch(error){setToast(error instanceof Error?error.message:'Falha ao registrar aprovação.');}
    finally{setBusy(false);}
  };
  const recalculate=()=>void load({capacidade:capacity,probAbandono:abandonment/100,tetoRuptura:rupture/100});
  const handleRow=(order:EnrichedOrder)=>void sendAction(`Investigue e recomende o próximo passo para o pedido ${order.order_id}.`);
  const handleCause=(id:string,title:string)=>void sendAction(`Investigue a causa-raiz ${title} (id ${id}) e recomende o próximo passo.`);
  const handleZero=()=>void sendAction('Monte o plano de hoje.');

  const loadCsv=async(files:FileList|null)=>{
    if(!files||files.length<3){setToast('Selecione os três arquivos CSV.');return;}
    setBusy(true);
    try{
      const byName=new Map(Array.from(files).map(file=>[file.name.toLocaleLowerCase('pt-BR'),file]));
      const find=(fragment:string)=>[...byName].find(([name])=>name.includes(fragment))?.[1];
      const [ordersFile,clientsFile,routesFile]=[find('pedidos_excecao'),find('clientes'),find('transportadoras')];
      if(!ordersFile||!clientsFile||!routesFile)throw new Error('Selecione pedidos_excecao.csv, clientes.csv e transportadoras.csv.');
      const [orderRows,clientRows,routeRows]=await Promise.all([ordersFile,clientsFile,routesFile].map(async file=>Papa.parse<Record<string,string>>(await file.text(),{header:true,skipEmptyLines:true}).data));
      const clients=new Map(clientRows.map(client=>[client.customer_id,client])),routes=new Map(routeRows.map(route=>[`${route.transportadora}|${route.uf_atendida}`,route]));
      const unique=new Map<string,Record<string,string>>();
      for(const order of orderRows){const prior=unique.get(order.order_id);if(!prior||(statuses[order.status as keyof typeof statuses]??0)>(statuses[prior.status as keyof typeof statuses]??0))unique.set(order.order_id,order);}
      const counters:Record<string,number>={};
      const orders=[...unique.values()].sort((a,b)=>a.order_id.localeCompare(b.order_id)).map(order=>{
        const prefix=order.order_id.startsWith('GC')?'GC':'GB';counters[prefix]=(counters[prefix]??0)+1;
        const customer=clients.get(order.customer_id)??{},route=routes.get(`${order.transportadora}|${order.uf}`)??{};
        let hash=0;for(const char of order.customer_id)hash=(hash*31+char.charCodeAt(0))>>>0;
        return {...order,order_id:`${prefix}-${String(counters[prefix]).padStart(4,'0')}`,customer_id:`CLI-${(hash%10000).toString().padStart(4,'0')}`,n_pedidos:Number(customer.n_pedidos??1),receita_acumulada:Number(customer.receita_acumulada??0),n_contatos_atendimento:Number(customer.n_contatos_atendimento??0),uf_atendida:order.uf,sla_contratado_dias_uteis:Number(route.sla_contratado_dias_uteis??0),custo_medio_frete:Number(route.custo_medio_frete??0)} as unknown as Order;
      });
      const response=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orders})});
      if(!response.ok)throw new Error('Falha ao recalcular o lote CSV.');
      setData(await response.json() as Dashboard);setSource('csv');setUploadOpen(false);setToast(`${orders.length.toLocaleString('pt-BR')} pedidos recalculados em memória nesta sessão.`);
    }catch(error){setToast(error instanceof Error?error.message:'Não foi possível ler os arquivos.');}
    finally{setBusy(false);}
  };

  return <main className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-4"><div className="rounded-xl bg-[#0052FF] p-3 text-white"><Activity size={24}/></div><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#0052FF]">GoGroup • Operações</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Torre de Controle AI-First</h1><p className="mt-1 text-sm text-slate-500">Gocase &amp; GoBeauté <span className="mx-1 text-slate-300">•</span> Referência 30/09/2026</p></div></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold">Fonte: {source==='snapshot'?'dataset do servidor':'CSV da sessão'}</span><button onClick={()=>setMethodologyOpen(true)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">Metodologia</button><button onClick={()=>setUploadOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#0052FF] px-3 py-2 text-xs font-semibold text-white"><Upload size={15}/>Carregar CSV</button></div></header>
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Premissas &amp; simulador</h2><p className="text-xs text-slate-500">Recalcule a fila sem alterar os dados persistidos.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Padrões definidos pelo motor</span></div><div className="grid gap-4 md:grid-cols-4 md:items-end"><NumberInput label="Capacidade diária" value={capacity} min={1} onChange={setCapacity}/><NumberInput label="Abandono de pagamento (%)" value={abandonment} min={0} max={100} onChange={setAbandonment}/><NumberInput label="Piso de ruptura (%)" value={rupture} min={0} max={100} onChange={setRupture}/><button disabled={loading||busy} onClick={recalculate} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Recalcular cenário</button></div></section>
    {loading&&!data?<div className="flex min-h-72 items-center justify-center text-slate-500">Carregando operação…</div>:data&&<><KPIs data={data} busy={busy} onZeroTouch={handleZero} actionCount={actions.length}/><Fila data={data} actions={actions} busy={busy} onAction={handleRow} onSelect={setSelected}/><CausasRaiz data={data} busy={busy} onAction={handleCause}/><AgentePainel actions={actions} busy={busy} onSend={message=>void sendAction(message)} onDecision={(id,decision)=>void decideAction(id,decision)} storeKind={storeKind} steps={agentSteps} summary={agentText}/><Auditoria actions={actions} audit={audit} orderStates={data.orderStates} onDecision={(id,decision)=>void decideAction(id,decision)}/></>}
    <footer className="flex flex-col gap-1 border-t border-slate-200 py-4 text-[11px] text-slate-400 sm:flex-row sm:justify-between"><span>GoGroup • Torre de Controle AI-First • Valores do motor determinístico</span><span>Estados da fila e auditoria são carregados do store.</span></footer>
  </div>
  {uploadOpen&&<div role="dialog" aria-modal="true" aria-labelledby="upload-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><span className="inline-flex rounded-lg bg-blue-50 p-2 text-[#0052FF]"><FileUp/></span><h2 id="upload-title" className="mt-3 text-xl font-bold">Carregar lote CSV</h2><p className="mt-1 text-sm text-slate-500">Os arquivos são calculados em memória e não são salvos em disco.</p></div><button aria-label="Fechar carregamento CSV" onClick={()=>setUploadOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div><label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 px-5 py-9 text-center hover:border-[#0052FF]"><Upload className="mb-3 text-[#0052FF]"/><span className="text-sm font-semibold">Selecione três arquivos CSV</span><span className="mt-1 text-xs text-slate-500">pedidos_excecao.csv, clientes.csv, transportadoras.csv</span><input type="file" accept=".csv,text/csv" multiple onChange={event=>void loadCsv(event.target.files)} className="sr-only"/></label>{busy&&<p className="mt-4 text-sm text-[#0052FF]">Processando lote…</p>}<p className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900"><ShieldCheck size={16} className="shrink-0"/>IDs são anonimizados antes do envio à API.</p></div></div>}
  {methodologyOpen&&<div role="dialog" aria-modal="true" aria-labelledby="method-title" className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"><aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#0052FF]">Metodologia</p><h2 id="method-title" className="mt-1 text-2xl font-bold">Fórmulas e efeitos</h2></div><button onClick={()=>setMethodologyOpen(false)} aria-label="Fechar metodologia" className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></div><div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-600"><p>Margem = valor × (1 − CMV de {BUSINESS.cmvRate*100}%). LTV em risco converte a receita por pedido para margem usando a mesma taxa.</p><p>Ações Zero-Touch são persistidas no store e movem os pedidos elegíveis para “em tratativa”. Avisos de cliente e chamadas a ERP/transportadora são simulados nesta instalação.</p><p>Fórmulas e origem de cada constante: consulte <code>docs/METODOLOGIA.md</code>.</p></div></aside></div>}
  {selected&&<div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={()=>setSelected(null)}><aside onClick={event=>event.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#0052FF]">Dossiê do pedido</p><h2 className="mt-1 text-xl font-bold">{selected.order_id}</h2></div><button onClick={()=>setSelected(null)} aria-label="Fechar dossiê" className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></div><dl className="mt-5 space-y-3">{[['Marca',selected.marca??'—'],['SKU',selected.sku??'—'],['Exceção',selected.tipo_excecao],['Status da fila',data?.orderStates[selected.order_id]??'aberto'],['Valor',new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(selected.valor)],['EV estimado',new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(selected.evRisco)],['Promessa recalculada',selected.data_prometida_real]].map(([label,value])=><div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}</dl></aside></div>}
  {toast&&<div role="status" className="fixed bottom-5 right-5 z-[60] flex max-w-sm items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"><Check size={16} className="text-emerald-400"/>{toast}<button onClick={()=>setToast('')} aria-label="Fechar aviso" className="ml-2 text-slate-400"><X size={15}/></button></div>}
  </main>;
}

function NumberInput({label,value,min,max,onChange}:{label:string;value:number;min:number;max?:number;onChange:(value:number)=>void}){return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input type="number" aria-label={label} min={min} max={max} value={value} onChange={event=>onChange(Number(event.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0052FF]"/></label>;}
