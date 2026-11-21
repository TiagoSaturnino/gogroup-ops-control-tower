import type { EnrichedOrder } from './engine';

export function compareResolutionOptions(row: EnrichedOrder) {
  const contact = row.custo_contato, ltv = row.perda_ltv_12m;
  const options = [
    { option: 'reenvio', costBrl: row.custo_reenvio + contact + ltv, components: { cmvAndFreightBrl: row.custo_reenvio, contactBrl: contact, ltvRiskBrl: ltv } },
    { option: 'reembolso', costBrl: row.custo_reembolso + contact + ltv, components: { amountPaidBrl: row.custo_reembolso, contactBrl: contact, ltvRiskBrl: ltv } },
    { option: 'aguardar', costBrl: row.evRisco, components: { expectedLossBrl: row.evRisco, probabilityCancel: row.probCancel, ltvRiskBrl: ltv } },
  ].map(option => ({ ...option, costBrl: Number(option.costBrl.toFixed(2)) }));
  const recommended = options.reduce((best, item) => item.costBrl < best.costBrl ? item : best, options[0]);
  return { orderId: row.order_id, paidBrl: row.valor, marginBrl: row.margem, options, recommended: recommended.option, reason: `Menor custo estimado no motor: ${recommended.option}.` };
}
