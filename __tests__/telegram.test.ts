import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeMarkdownV2 } from '../lib/telegram';
import { notifyPendingTelegramActions } from '../lib/telegram';
import { sendZeroTouchTelegram } from '../lib/telegram-api';
import { MemoryActionStore, type ActionStore } from '../lib/store';
import type { Action } from '../lib/actions';
import { runAgentTool } from '../lib/agent/tools';

const envKeys = ['TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','TELEGRAM_TEAM_CHAT_ID','TELEGRAM_DEMO_CUSTOMER_CHAT_ID'] as const;
const envOriginal = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const fetchOriginal = globalThis.fetch;
const priorStore = (globalThis as typeof globalThis & { __gogroupActionStore?: ActionStore }).__gogroupActionStore;
afterEach(() => {
  for (const key of envKeys) { const value = envOriginal[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = fetchOriginal;
  (globalThis as typeof globalThis & { __gogroupActionStore?: ActionStore }).__gogroupActionStore = priorStore;
  vi.restoreAllMocks();
});

describe('integração Telegram', () => {
  it('escapa os caracteres especiais de MarkdownV2', () => {
    expect(escapeMarkdownV2('pedido_1 [x]. R$ 10,00!')).toBe('pedido\\_1 \\[x\\]\\. R$ 10,00\\!');
  });

  it('mantém updates e operações idempotentes no store de memória', async () => {
    const store = new MemoryActionStore();
    expect(await store.claimTelegramUpdate('update-1')).toBe(true);
    expect(await store.claimTelegramUpdate('update-1')).toBe(false);
    await store.releaseTelegramUpdate('update-1');
    expect(await store.claimTelegramUpdate('update-1')).toBe(true);
    expect(await store.claimTelegramOperation('send-1')).toBe(true);
    expect(await store.claimTelegramOperation('send-1')).toBe(false);
  });

  it('envia por marca ao chat de demonstração e não duplica a entrega', async () => {
    process.env.TELEGRAM_BOT_TOKEN='token-nao-impresso';
    process.env.TELEGRAM_WEBHOOK_SECRET='secret';
    process.env.TELEGRAM_TEAM_CHAT_ID='-1001';
    process.env.TELEGRAM_DEMO_CUSTOMER_CHAT_ID='42';
    const store = new MemoryActionStore(), calls: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (_input, init) => { calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return Response.json({ ok: true, result: { message_id: calls.length } }); }) as typeof fetch;
    const action = { id:'0123456789abcdef01234567', orderIds:['GC-001','GB-002'], tipo:'zero_touch_aviso', status:'executada', responsavel:'agente', canal:'ui', impactoBrl:10, horasLiberadas:1, justificativa:'Teste', calculo:{}, criadaEm:new Date().toISOString(), atualizadaEm:new Date().toISOString(), efeito:{tipo:'simulado',descricao:'Aviso de teste.',sistema:'WhatsApp Business API'} } as Action;
    const orders = [{order_id:'GC-001',marca:'Gocase'},{order_id:'GB-002',marca:'GoBeauté'}];
    expect((await sendZeroTouchTelegram(action,orders,store)).complete).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls.every(call => call.chat_id === '42')).toBe(true);
    expect(String(calls[0].text)).toContain('Gocase');
    expect(String(calls[1].text)).toContain('GoBeauté');
    expect((await sendZeroTouchTelegram(action,orders,store)).complete).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('marca Zero-Touch como real apenas depois do envio e persiste em tratativa', async () => {
    process.env.TELEGRAM_BOT_TOKEN='test-token'; process.env.TELEGRAM_WEBHOOK_SECRET='secret'; process.env.TELEGRAM_TEAM_CHAT_ID='-1001'; process.env.TELEGRAM_DEMO_CUSTOMER_CHAT_ID='42';
    const store=new MemoryActionStore();
    globalThis.fetch=vi.fn(async ()=>Response.json({ok:true,result:{message_id:1}})) as typeof fetch;
    const dataset={orders:[{order_id:'GC-TELE-1',customer_id:'CLI-1',marca:'Gocase',data_pedido:'2026-09-25',data_entrega:'2026-09-28',valor:100,tipo_excecao:'atraso_entrega',receita_acumulada:0,n_pedidos:1,sla_contratado_dias_uteis:0,custo_medio_frete:10}]};
    const result=await runAgentTool('executar_lote_zero_touch',{categoria:'todos'},dataset,store) as {resultado:{action:Action}};
    expect(result.resultado.action.efeito.tipo).toBe('real');
    expect(result.resultado.action.canal).toBe('telegram');
    expect((await store.getOrderStates())['GC-TELE-1']).toBe('em_tratativa');
  });

  it('publica botões na ação pendente e callback aprova via store compartilhado', async () => {
    process.env.TELEGRAM_BOT_TOKEN='test-token';
    process.env.TELEGRAM_WEBHOOK_SECRET='secret-test';
    process.env.TELEGRAM_TEAM_CHAT_ID='-1001';
    process.env.TELEGRAM_DEMO_CUSTOMER_CHAT_ID='42';
    const store=new MemoryActionStore();
    (globalThis as typeof globalThis & { __gogroupActionStore?: ActionStore }).__gogroupActionStore=store;
    const action:Action={id:'abcdef0123456789abcdef01',orderIds:[],tipo:'escalonamento',status:'aguardando_aprovacao',responsavel:'agente',canal:'telegram',impactoBrl:0,horasLiberadas:0,justificativa:'Revisão humana necessária.',calculo:{decisor:'Líder de Operações',recomendacao:'aguardar'},criadaEm:new Date().toISOString(),atualizadaEm:new Date().toISOString(),efeito:{tipo:'simulado',descricao:'Efeito interno após aprovação.',sistema:'ERP'}};
    await store.createAction(action);
    const apiCalls:Array<{method?:string;body?:string}>=[];
    globalThis.fetch=vi.fn(async (_input,init)=>{apiCalls.push({method:init?.method,body:String(init?.body)});const method=apiCalls.at(-1)?.body?.includes('answerCallbackQuery')?true:{message_id:77};return Response.json({ok:true,result:method});}) as typeof fetch;
    await notifyPendingTelegramActions([action]);
    const sent=JSON.parse(apiCalls[0].body??'{}');
    expect(sent.reply_markup.inline_keyboard[0].map((button:{text:string})=>button.text)).toEqual(['✅ Aprovar','❌ Rejeitar']);
    const {POST}=await import('../app/api/telegram/route');
    const update={update_id:9001,callback_query:{id:'cb-1',data:`act:${action.id}:aprovar`,from:{id:1,first_name:'Ana'},message:{message_id:77,chat:{id:-1001}}}};
    const request=()=>new Request('https://example.test/api/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'secret-test'},body:JSON.stringify(update)});
    expect((await POST(request())).status).toBe(200);
    expect((await store.getAction(action.id))?.status).toBe('executada');
    expect((await store.listAudit()).some(record=>record.descricao.includes('Ana'))).toBe(true);
    const priorCalls=apiCalls.length;
    expect((await POST(request())).status).toBe(200);
    expect(apiCalls).toHaveLength(priorCalls);
  });

  it('não revela configuração ausente como erro interno de webhook', async () => {
    for (const key of envKeys) delete process.env[key];
    const { POST } = await import('../app/api/telegram/route');
    const response = await POST(new Request('https://example.test/api/telegram',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('configure');
  });
});
