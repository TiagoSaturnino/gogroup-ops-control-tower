import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { dashboard, executeDeterministic, loadDataset } from '@/lib/tools';
const tools=[
 {type:'function',function:{name:'executar_lote_zero_touch',description:'Executa lote Zero-Touch elegÃ­vel',parameters:{type:'object',properties:{categoria:{type:'string',enum:['atraso_entregue','pagamento_pendente','endereco_divergente','todos']}},required:['categoria']}}},
 {type:'function',function:{name:'resolver_pedido_individual',description:'Resolve ou encaminha pedido individual respeitando alÃ§ada',parameters:{type:'object',properties:{orderId:{type:'string'},acaoRecomendada:{type:'string'}},required:['orderId','acaoRecomendada']}}},
 {type:'function',function:{name:'aplicar_acao_sistemica',description:'Prepara aÃ§Ã£o para anomalia operacional',parameters:{type:'object',properties:{anomaliaId:{type:'string'}},required:['anomaliaId']}}},
 {type:'function',function:{name:'simular_premissas_e_capacidade',description:'Simula premissas operacionais',parameters:{type:'object',properties:{capacidadeDiaria:{type:'number'},probAbandonoPagamento:{type:'number'},tetoRuptura:{type:'number'}}}}}
] as const;
export async function POST(request:Request) {
 let body:{message?:string;prompt?:string}; try {body=await request.json();} catch{return NextResponse.json({error:'JSON invÃ¡lido.'},{status:400});}
 const dataset=loadDataset(), context=dashboard(dataset);
 const fallback=(name='executar_lote_zero_touch',args:Record<string,unknown>={categoria:'todos'})=>NextResponse.json(executeDeterministic(name,args,dataset));
 if(!process.env.GROQ_API_KEY) return fallback();
 try {
  const client=new Groq({apiKey:process.env.GROQ_API_KEY}); let model='llama-3.3-70b-versatile';
  let response;
  try { response=await client.chat.completions.create({model,messages:[{role:'system',content:`VocÃª Ã© agente operacional. Use uma ferramenta apropriada. NÃ£o invente valores financeiros ou prazos. Contexto determinÃ­stico: ${JSON.stringify({totals:context.totals,systemic:context.systemic.map(({id,title,count,gmvExposto,economiaEstimada})=>({id,title,count,gmvExposto,economiaEstimada}))})}`},{role:'user',content:body.message??body.prompt??'Priorize os casos elegÃ­veis para automaÃ§Ã£o.'}],tools:[...tools],tool_choice:'auto'}); }
  catch {model='llama-3.1-8b-instant'; response=await client.chat.completions.create({model,messages:[{role:'system',content:`Use ferramenta apropriada. Contexto: ${JSON.stringify(context.totals)}`},{role:'user',content:body.message??body.prompt??'Priorize os casos Zero-Touch.'}],tools:[...tools],tool_choice:'auto'});}
  const call=response.choices[0]?.message.tool_calls?.[0]; if(!call)return NextResponse.json({...executeDeterministic('executar_lote_zero_touch',{categoria:'todos'},dataset),modelUsed:model});
  const args=JSON.parse(call.function.arguments) as Record<string,unknown>; const result=executeDeterministic(call.function.name,args,dataset); return NextResponse.json({...result,modelUsed:model});
 } catch { return fallback(); }
}

