import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { createHash } from 'node:crypto';

const root = process.cwd();
const parse = (name) => Papa.parse(fs.readFileSync(path.join(root, 'data/raw', name), 'utf8').replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true, dynamicTyping: false }).data;
const orders = parse('pedidos_excecao.csv');
const customers = new Map(parse('clientes.csv').map((row) => [row.customer_id, row]));
const routes = parse('transportadoras.csv');
const rank = { em_analise: 1, aberta: 2, aguardando_transportadora: 3, aguardando_cliente: 4 };
const unique = new Map();
for (const order of orders) {
  const old = unique.get(order.order_id);
  if (!old || (rank[order.status] ?? 0) > (rank[old.status] ?? 0)) unique.set(order.order_id, order);
}
const routeIndex = new Map(routes.map((route) => [`${route.transportadora}|${route.uf_atendida}`, route]));
const buckets = new Map();
for (const row of [...unique.values()].sort((a, b) => a.order_id.localeCompare(b.order_id))) {
  const prefix = row.order_id.startsWith('GC') ? 'GC' : 'GB';
  const list = buckets.get(prefix) ?? [];
  list.push(row);
  buckets.set(prefix, list);
}
const snapshotOrders = [];
for (const [prefix, rows] of buckets) {
  rows.forEach((row, index) => {
    const customer = customers.get(row.customer_id) ?? {};
    const route = routeIndex.get(`${row.transportadora}|${row.uf}`) ?? {};
    const cliHash = createHash('sha256').update(row.customer_id).digest('hex').slice(0, 4).toUpperCase();
    snapshotOrders.push({ ...row, order_id: `${prefix}-${String(index + 1).padStart(4, '0')}`, customer_id: `CLI-${cliHash}`, ...customer, customer_id: `CLI-${cliHash}`, uf_atendida: row.uf, sla_contratado_dias_uteis: Number(route.sla_contratado_dias_uteis ?? 0), custo_medio_frete: Number(route.custo_medio_frete ?? 0) });
  });
}
fs.mkdirSync(path.join(root, 'data/private'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/private/snapshot_2000.json'), JSON.stringify({ generatedAt: new Date().toISOString(), orders: snapshotOrders, routes }, null, 2));
const demo = Array.from({ length: 30 }, (_, i) => ({ order_id: `GC-${String(i + 1).padStart(4, '0')}`, customer_id: `CLI-${String((i * 137) % 10000).padStart(4, '0')}`, marca: i % 2 ? 'GoBeautÃƒÂ©' : 'Gocase', data_pedido: `2026-09-${String((i % 20) + 1).padStart(2, '0')}`, valor: 80 + (i * 17 % 240), sku: `DEMO-${String(i + 1).padStart(3, '0')}`, descricao_produto: 'Produto demonstrativo fictÃƒÂ­cio', qtd_itens: 1 + i % 4, brinde_no_pedido: i % 3 === 0, tipo_excecao: ['atraso_entrega', 'pagamento_pendente', 'endereco_divergente', 'ruptura_pos_venda', 'item_faltante', 'rastreio_parado'][i % 6], status: ['aberta', 'em_analise', 'aguardando_transportadora'][i % 3], transportadora: ['Rota Express', 'Veloz Log', 'Entrega JÃƒÂ¡'][i % 3], uf: ['SP', 'BA', 'CE', 'RJ'][i % 4], cidade: 'Cidade FictÃƒÂ­cia', data_prometida: null, data_entrega: i % 4 === 0 ? `2026-09-${String(Math.min(28, (i % 20) + 3)).padStart(2, '0')}` : null, maquina: null, turno: i % 3 === 0 ? 'noite' : 'tarde', cd: i % 2 ? 'CD1' : 'CD2', lote_produto: i % 4 === 0 ? 'L2607-B' : null, data_abertura_excecao: `2026-09-${String((i % 20) + 5).padStart(2, '0')}`, n_pedidos: 1 + i % 6, receita_acumulada: 300 + i * 61, n_contatos_atendimento: i % 3, uf_atendida: ['SP', 'BA', 'CE', 'RJ'][i % 4], sla_contratado_dias_uteis: 3, custo_medio_frete: 12 }));
fs.writeFileSync(path.join(root, 'data/demo_fallback.json'), JSON.stringify({ orders: demo, routes }, null, 2));
console.log(`Snapshot: ${snapshotOrders.length} pedidos ÃƒÂºnicos; rotas: ${routes.length}; demo: ${demo.length}`);


