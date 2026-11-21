// Constantes financeiras e operacionais do desafio; origens indicadas individualmente.
export const BUSINESS = {
  cmvRate: 0.24, // Dado oficial do enunciado: CMV de 24%.
  dailyCapacity: 150, // Dado oficial do enunciado: 150 tratativas por dia.
  minutesPerCase: 12, // Dado oficial do enunciado: 12 minutos por caso.
  contactCost: 9, // Dado oficial do enunciado: custo de contato de R$ 9.
  cancelBands: [ // Dado oficial do enunciado: probabilidades por faixa de atraso.
    { maxDays: 2, probability: 0.04 }, { maxDays: 5, probability: 0.10 },
    { maxDays: 10, probability: 0.22 }, { maxDays: Infinity, probability: 0.40 },
  ],
  vipRepurchaseRate: 0.70, // Dado oficial do enunciado: recompra VIP de 70%.
  regularRepurchaseRate: 0.28, // Dado oficial do enunciado: recompra regular de 28%.
  ltvDropRate: 0.50, // Dado oficial do enunciado: queda de recompra de 50%.
  holidays: ['2026-09-07', '2026-10-12'], // Dado oficial do enunciado: feriados de 07/09 e 12/10.
  referenceDate: '2026-09-30', // Data de referência informada pela base do desafio.
  orderPreparationBusinessDays: 1, // PREMISSA NOSSA: 1 dia útil de preparação além do SLA de transporte.
  vipThreshold: 1500, // Dado oficial do enunciado: limite VIP de R$ 1.500.
  paymentExpiryBusinessDays: 5, // PREMISSA NOSSA: expirar pedido não pago após 5 dias úteis.
  paymentAbandonmentProbability: 0.30, // PREMISSA NOSSA: abandono de pagamento de 30%.
  stockoutRiskFloor: 0.40, // PREMISSA NOSSA: piso de risco para ruptura de 40%.
  approvalValueThreshold: 250, // PREMISSA NOSSA: alçada humana acima de R$ 250.
  itemMissingReshipShare: 0.40, // PREMISSA NOSSA: fração do custo de reenvio em item faltante.
  trackingRiskFloor: 0.22, // PREMISSA NOSSA: piso de risco de rastreio/devolução de 22%.
  agentRequestsPerWindow: 20, // Limite definido nesta tarefa: 20 chamadas por janela.
  agentRateLimitWindowMs: 10 * 60 * 1000, // Limite definido nesta tarefa: janela de 10 minutos.
  agentMessageMaxLength: 500, // Limite definido nesta tarefa: mensagem de até 500 caracteres.
} as const;

export const ZERO_TOUCH_MINUTES_SAVED = BUSINESS.minutesPerCase; // Dado oficial do enunciado: cada caso consome 12 minutos.
