import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { createHash } from 'node:crypto';

const root = process.cwd();
const dataDir = path.join(root, 'data');
const types = ['atraso_entrega','pagamento_pendente','endereco_divergente','ruptura_pos_venda','item_faltante','rastreio_parado','devolvido_transportadora','extravio','avaria_transporte','vazamento_produto','falha_personalizacao'];
const routes = [
  { transportadora: 'Rota Express', uf_atendida: 'BA', sla_contratado_dias_uteis: 6, custo_medio_frete: 19.78 },
  { transportadora: 'Veloz Log', uf_atendida: 'BA', sla_contratado_dias_uteis: 6, custo_medio_frete: 23 },
  { transportadora: 'Entrega Já', uf_atendida: 'BA', sla_contratado_dias_uteis: 5, custo_medio_frete: 26.45 },
];
const demo = Array.from({ length: 60 }, (_, i) => ({
  order_id: `GC-${String(i + 1).padStart(4, '0')}`, customer_id: `CLI-${String((i * 137) % 10000).padStart(8, '0')}`,
  marca: i % 11 === 8 ? 'Lescent' : i % 2 ? 'GoBeauté' : 'Gocase', data_pedido: `2026-09-${String((i % 20) + 1).padStart(2, '0')}`,
  valor: 80 + (i * 17 % 240), sku: i % 11 === 3 ? 'KSH-1010' : i % 11 === 9 ? 'APC-1067' : `DEMO-${String(i + 1).padStart(3, '0')}`,
  descricao_produto: 'Produto demonstrativo fictício', qtd_itens: 1 + i % 4, brinde_no_pedido: i % 3 === 0,
  tipo_excecao: types[i % types.length], status: ['aberta','em_analise','aguardando_transportadora'][i % 3],
  transportadora: ['Rota Express','Veloz Log','Entrega Já','Carga Norte'][i % 4], uf: ['SP','BA','CE','RJ','PE','RN'][i % 6], cidade: 'Cidade Fictícia',
  data_prometida: `2026-09-${String((i % 20) + 1).padStart(2,'0')}`, data_entrega: i % 4 === 0 ? `2026-09-${String(Math.min(28,(i % 20)+3)).padStart(2,'0')}` : null,
  maquina: i % 7 === 0 ? 'IMP-02' : null, turno: i % 3 === 0 ? 'noite' : 'tarde', cd: i % 2 ? 'CD1' : 'CD2',
  lote_produto: i % 11 === 9 ? 'L2607-B' : null, data_abertura_excecao: `2026-09-${String((i % 20) + 5).padStart(2,'0')}`,
  n_pedidos: 1 + i % 6, receita_acumulada: i % 9 === 0 ? 2200 : 300 + i * 61, n_contatos_atendimento: i % 3,
  uf_atendida: ['SP','BA','CE','RJ','PE','RN'][i % 6], sla_contratado_dias_uteis: 3, custo_medio_frete: 12,
}));
demo.push({ ...demo[0], order_id: 'GC-0061', status: 'aguardando_cliente' });
fs.writeFileSync(path.join(dataDir, 'demo_fallback.json'), JSON.stringify({ orders: demo.slice(0, 60), routes }, null, 2), 'utf8');

if (!fs.existsSync(path.join(dataDir, 'raw', 'pedidos_excecao.csv'))) {
  console.log(`Demo sintética: ${demo.length - 1} pedidos; snapshot privado não regenerado (CSV ausente).`);
  process.exit(0);
}
const parse = name => Papa.parse(fs.readFileSync(path.join(dataDir, 'raw', name), 'utf8').replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true, dynamicTyping: false }).data;
const orders = parse('pedidos_excecao.csv'), customers = new Map(parse('clientes.csv').map(row => [row.customer_id, row])), sourceRoutes = parse('transportadoras.csv');
const rank = { em_analise: 1, aberta: 2, aguardando_transportadora: 3, aguardando_cliente: 4 }, unique = new Map();
for (const order of orders) { const old = unique.get(order.order_id); if (!old || (rank[order.status] ?? 0) > (rank[old.status] ?? 0)) unique.set(order.order_id, order); }
const routeIndex = new Map(sourceRoutes.map(route => [`${route.transportadora}|${route.uf_atendida}`, route])), buckets = new Map();
for (const row of [...unique.values()].sort((a,b) => a.order_id.localeCompare(b.order_id))) { const prefix = row.order_id.startsWith('GC') ? 'GC' : 'GB', list = buckets.get(prefix) ?? []; list.push(row); buckets.set(prefix,list); }
const snapshotOrders = [];
for (const [prefix, rows] of buckets) rows.forEach((row,index) => {
  const customer = customers.get(row.customer_id) ?? {}, route = routeIndex.get(`${row.transportadora}|${row.uf}`) ?? {};
  const cliHash = createHash('sha256').update(row.customer_id).digest('hex').slice(0,8).toUpperCase();
  snapshotOrders.push({ ...row, order_id: `${prefix}-${String(index+1).padStart(4,'0')}`, ...customer, customer_id: `CLI-${cliHash}`, uf_atendida: row.uf, sla_contratado_dias_uteis: Number(route.sla_contratado_dias_uteis ?? 0), custo_medio_frete: Number(route.custo_medio_frete ?? 0) });
});
fs.mkdirSync(path.join(dataDir,'private'),{recursive:true});
fs.writeFileSync(path.join(dataDir,'private','snapshot_2000.json'),JSON.stringify({generatedAt:new Date().toISOString(),orders:snapshotOrders,routes:sourceRoutes},null,2),'utf8');
console.log(`Snapshot: ${snapshotOrders.length} pedidos únicos; rotas: ${sourceRoutes.length}; demo: ${demo.length-1}`);
