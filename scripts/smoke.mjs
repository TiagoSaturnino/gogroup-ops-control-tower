import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const baseUrl = process.argv[2]?.replace(/\/$/, '');
if (!baseUrl) {
  console.error('Uso: npm run smoke -- https://sua-url.vercel.app');
  process.exit(2);
}

let failed = false;
function report(label, ok, detail = '') {
  console.log(`${ok ? 'OK' : 'FALHA'} ${label}${detail ? ` — ${detail}` : ''}`);
  failed ||= !ok;
}

async function getJson(route) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error ?? 'resposta não OK'}`);
  return body;
}

async function postJson(route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${payload.error ?? 'resposta não OK'}`);
  return payload;
}

try {
  const health = await getJson('/api/health');
  report('GET /api/health', ['redis', 'memoria'].includes(health.store) && ['groq', 'deterministic'].includes(health.modelo) && ['configurado', 'nao_configurado'].includes(health.telegram));
} catch (error) { report('GET /api/health', false, error.message); }

let expectedDemoCount = 60;
try {
  const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/demo_fallback.json'), 'utf8'));
  expectedDemoCount = fixture.orders.length;
} catch { /* o teste aceita o total padrão da demo sintética */ }
try {
  const operations = await getJson('/api/operations');
  const count = operations.totals?.pedidos;
  report('GET /api/operations', count === 2000 || count === expectedDemoCount, `${count ?? 'total ausente'} pedidos`);
} catch (error) { report('GET /api/operations', false, error.message); }

try {
  const agent = await postJson('/api/agent', { message: 'Monte o plano de hoje' });
  report('POST /api/agent', Array.isArray(agent.steps) && agent.steps.length >= 3, `${agent.steps?.length ?? 0} passos`);
} catch (error) { report('POST /api/agent', false, error.message); }

try {
  const actions = await getJson('/api/actions');
  report('GET /api/actions', Array.isArray(actions.actions), `${actions.actions?.length ?? 0} ações`);
} catch (error) { report('GET /api/actions', false, error.message); }

try {
  await postJson('/api/demo/reset', {});
  const state = await getJson('/api/actions');
  report('POST /api/demo/reset', state.actions.length === 0 && Object.keys(state.orderStates).length === 0, `${state.actions.length} ações, ${Object.keys(state.orderStates).length} estados`);
} catch (error) { report('POST /api/demo/reset', false, error.message); }

process.exitCode = failed ? 1 : 0;
