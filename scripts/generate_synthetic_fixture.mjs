import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const demo = JSON.parse(fs.readFileSync(path.join(root, 'data/demo_fallback.json'), 'utf8'));
const orders = [...demo.orders];
for (const index of [0, 10, 20]) orders.push({ ...orders[index], status: 'aguardando_cliente' });
fs.mkdirSync(path.join(root, 'data/fixtures'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/fixtures/synthetic.json'), JSON.stringify({ orders, routes: demo.routes }, null, 2), 'utf8');
console.log(`Fixture sintética: ${orders.length} linhas, ${demo.orders.length} pedidos únicos.`);
