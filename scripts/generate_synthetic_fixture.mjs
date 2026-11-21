import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const demo = JSON.parse(fs.readFileSync(path.join(root, 'data/demo_fallback.json'), 'utf8'));
// SKUs de regra, citados no motor, só permanecem nos pedidos usados pelas respectivas causas.
const orders = demo.orders.map((order, index) => {
  const skuDeRegra = (order.sku === 'APC-1067' && order.tipo_excecao === 'vazamento_produto' && order.lote_produto === 'L2607-B')
    || (/^KSH-\d{4}$/.test(String(order.sku ?? '')) && order.tipo_excecao === 'ruptura_pos_venda');
  return {
    ...order,
    sku: skuDeRegra ? order.sku : `DEMO-${String(index + 1).padStart(3, '0')}`,
    descricao_produto: `Produto demonstrativo fictício ${String(index + 1).padStart(3, '0')}`,
  };
});
for (const index of [0, 10, 20]) orders.push({ ...orders[index], status: 'aguardando_cliente' });
fs.mkdirSync(path.join(root, 'data/fixtures'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/fixtures/synthetic.json'), JSON.stringify({ orders, routes: demo.routes }, null, 2), 'utf8');
console.log(`Fixture sintética: ${orders.length} linhas, ${demo.orders.length} pedidos únicos.`);
