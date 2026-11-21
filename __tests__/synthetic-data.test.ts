import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Order } from '../lib/engine';

const files = ['data/demo_fallback.json', 'data/fixtures/synthetic.json'];
const loadOrders = (file: string) => (JSON.parse(readFileSync(file, 'utf8')) as { orders: Order[] }).orders;

describe('dados fictícios de demonstração', () => {
  for (const file of files) {
    it(`${file} usa somente SKUs de regra necessários ou DEMO-nnn e descrição genérica`, () => {
      const orders = loadOrders(file);
      expect(orders.length).toBeGreaterThan(0);
      for (const order of orders) {
        if (order.sku === 'APC-1067') {
          expect(order.tipo_excecao).toBe('vazamento_produto');
          expect(order.lote_produto).toBe('L2607-B');
        } else if (/^KSH-\d{4}$/.test(order.sku ?? '')) {
          expect(order.tipo_excecao).toBe('ruptura_pos_venda');
        } else {
          expect(order.sku).toMatch(/^DEMO-\d{3}$/);
        }
        expect(order.descricao_produto).toMatch(/^Produto demonstrativo fictício \d{3}$/);
      }
    });
  }
});
