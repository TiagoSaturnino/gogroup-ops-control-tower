import Groq from 'groq-sdk';
import { validateAgentText } from './guardrails';

export type CommunicationFacts = {
  marca: string;
  status: string;
  prazoDiasUteis: number;
  opcaoRecomendada: string;
};
export type CommunicationInput = {
  orderId: string;
  motivo: string;
  fatosDoMotor: CommunicationFacts;
  canal: 'aprovacao' | 'zero_touch';
};
export type CommunicationModel = (model: string, messages: Array<{ role: 'system' | 'user'; content: string }>) => Promise<string | null>;
export type CommunicationResult = {
  rascunho: string;
  modelUsed: string;
  entradaFatos: CommunicationFacts;
  validado: boolean;
  numeroNaoVerificado: boolean;
};

export const COMMUNICATION_SYSTEM_PROMPT = `Você é o sub-agente de Comunicação da GoGroup. Redija uma mensagem curta, empática e natural no tom da marca informada. Use somente status, prazo em dias úteis e opção recomendada fornecidos pelo motor. Não invente valores ou prazos, não prometa reembolso, entrega, resolução ou compensação. Não inclua números, datas ou identificadores na mensagem. Máximo de 500 caracteres. Entregue somente o texto da mensagem, sem aspas, rótulos ou explicações.`;

const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

export function communicationTemplate(input: CommunicationInput) {
  const brand = input.fatosDoMotor.marca.trim() || 'nossa equipe';
  return `Olá! Aqui é a equipe ${brand}. Recebemos sua solicitação sobre seu pedido. Estamos acompanhando o caso e seguiremos a política da marca. Se precisar de ajuda, responda por este canal.`.slice(0, 500);
}

async function groqCall(model: string, messages: Array<{ role: 'system' | 'user'; content: string }>) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('Groq indisponível');
  const client = new Groq({ apiKey: key });
  const completion = await client.chat.completions.create({ model, messages, temperature: 0.2, max_tokens: 220 });
  return completion.choices[0]?.message?.content ?? null;
}

export async function runCommunicationAgent(input: CommunicationInput, callModel: CommunicationModel = groqCall): Promise<CommunicationResult> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: COMMUNICATION_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ orderId: input.orderId, motivo: input.motivo, fatosDoMotor: input.fatosDoMotor, canal: input.canal }) },
  ];

  let generated: string | null = null;
  let modelUsed = 'deterministic';
  if (process.env.GROQ_API_KEY || callModel !== groqCall) {
    try {
      generated = await callModel(PRIMARY_MODEL, messages);
      modelUsed = PRIMARY_MODEL;
    } catch {
      try {
        generated = await callModel(FALLBACK_MODEL, messages);
        modelUsed = FALLBACK_MODEL;
      } catch {
        generated = null;
      }
    }
  }

  const candidate = generated?.trim().slice(0, 500) ?? '';
  const validation = candidate ? validateAgentText(candidate, [input.fatosDoMotor]) : { valid: false, invalidMoney: [], invalidPeriods: [], text: '' };
  const accepted = validation.valid && candidate.length > 0;
  return {
    rascunho: accepted ? candidate : communicationTemplate(input),
    modelUsed: accepted ? modelUsed : 'deterministic',
    entradaFatos: input.fatosDoMotor,
    validado: accepted,
    numeroNaoVerificado: Boolean(candidate && !validation.valid),
  };
}
