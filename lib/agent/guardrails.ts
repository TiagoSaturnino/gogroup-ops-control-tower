import type { ActionStore } from '../store';

const MONEY_KEY = /(brl|valor|custo|ev|margem|perda|frete|ltv|preco|preço|impacto)/i;
const TIME_KEY = /(dia|prazo|sla|hora|minuto|capacidade)/i;
const moneyNumber = (value: string) => {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return Number(normalized);
};

function knownNumbers(value: unknown, key: string, money: Set<number>, times: Set<number>) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (MONEY_KEY.test(key)) money.add(Number(value.toFixed(2)));
    if (TIME_KEY.test(key)) times.add(value);
  } else if (Array.isArray(value)) value.forEach(item => knownNumbers(item, key, money, times));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => knownNumbers(child, childKey, money, times));
}

export function validateAgentText(text: string, results: unknown[]) {
  const money = new Set<number>(), times = new Set<number>();
  results.forEach(result => knownNumbers(result, '', money, times));
  const amounts = [...text.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi)].map(match => moneyNumber(match[1]));
  const periods = [...text.matchAll(/\b(\d+(?:[,.]\d+)?)\s*(?:dias?\s+úteis|dias?|d\.u\.|horas?|h|minutos?|min)\b/gi)].map(match => Number(match[1].replace(',', '.')));
  const invalidMoney = amounts.filter(value => !money.has(Number(value.toFixed(2))));
  const invalidPeriods = periods.filter(value => !times.has(value));
  if (invalidMoney.length || invalidPeriods.length) return { valid: false, invalidMoney, invalidPeriods, text: 'Substituí uma resposta com valores ou prazos sem correspondência nas ferramentas determinísticas. Consulte a trilha e os cálculos abaixo.' };
  return { valid: true, invalidMoney: [] as number[], invalidPeriods: [] as number[], text };
}

export async function recordGuardrailOccurrence(store: ActionStore, id: string, description: string) {
  const occurredAt = new Date().toISOString();
  await store.appendAudit({ id: `${id}:guardrail`, actionId: id, evento: 'texto_corrigido', responsavel: 'agente', ocorridaEm: occurredAt, descricao: description });
}
