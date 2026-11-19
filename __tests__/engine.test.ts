import { describe, expect, it } from 'vitest';
import { addBusinessDaysAfter, calculateOrder, runEngine, type Order } from '../lib/engine';
import fs from 'node:fs';
const base: Order = { order_id:'GC-0001', customer_id:'CLI-0001', data_pedido:'2026-09-04', valor:100, tipo_excecao:'item_faltante', sla_contratado_dias_uteis:1, custo_medio_frete:12, receita_acumulada:1000, n_pedidos:2 };
describe('motor determinístico',()=>{
 it('conta dias úteis após fim de semana e feriado nacional',()=>{ expect(addBusinessDaysAfter('2026-09-04',1)).toBe('2026-09-08'); expect(addBusinessDaysAfter('2026-09-04',2)).toBe('2026-09-09'); });
 it('snapshot anonimizado possui 2.000 pedidos e exatamente 500 Zero-Touch',()=>{ const data=JSON.parse(fs.readFileSync('data/private/snapshot_2000.json','utf8')); const result=runEngine(data.orders); expect(data.orders).toHaveLength(2000); expect(new Set(data.orders.map((o:Order)=>o.order_id)).size).toBe(2000); expect(result.totals.zeroTouch).toBe(500); });
 it('exige alçada para VIP, pedido acima de R$ 200 e ruptura',()=>{ expect(calculateOrder({...base,receita_acumulada:1501},{capacidadeDiaria:150,probAbandonoPagamento:.3,tetoRuptura:.4}).requerAlcadaHumana).toBe(true); expect(calculateOrder({...base,valor:201},{capacidadeDiaria:150,probAbandonoPagamento:.3,tetoRuptura:.4}).requerAlcadaHumana).toBe(true); expect(calculateOrder({...base,tipo_excecao:'ruptura_pos_venda'},{capacidadeDiaria:150,probAbandonoPagamento:.3,tetoRuptura:.4}).requerAlcadaHumana).toBe(true); });
});
