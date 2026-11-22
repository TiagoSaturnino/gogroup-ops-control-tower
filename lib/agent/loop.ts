import { ROLES, TOOL_DEFINITIONS, TOOL_ROLE, type AgentRole } from './roles';
import { validateAgentText } from './guardrails';

export type AgentToolCall = { id: string; function: { name: string; arguments: string } };
export type AgentCompletion = { content: string | null; toolCalls?: AgentToolCall[] };
export type AgentStep = { round: number; papel: AgentRole; pensamentoResumido: string; tool: string; argumentos: Record<string, unknown>; resultado: unknown };
export type AgentLoopResult = { modelUsed: string; text: string; steps: AgentStep[]; guardrailTriggered: boolean };
export type AgentMessage = Record<string, unknown>;
export type AgentLoopOptions = {
  message: string;
  context: Record<string, unknown>;
  callModel: (model: string, messages: AgentMessage[], tools: readonly unknown[]) => Promise<AgentCompletion>;
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  deterministicFallback: () => Promise<AgentLoopResult>;
  onGuardrail?: (description: string) => Promise<void>;
  maxSteps?: number;
};

const MODEL_PRIMARY = 'llama-3.3-70b-versatile';
const MODEL_FALLBACK = 'llama-3.1-8b-instant';
const safeSummary = (name: string, role: AgentRole, result: unknown) => {
  if (result && typeof result === 'object' && 'summary' in result && typeof result.summary === 'string') return `${role}: ${result.summary}`;
  const purpose: Record<string, string> = { listar_fila: 'li a fila priorizada pelo motor', detalhar_pedido: 'consultei as evidências do pedido', comparar_opcoes_resolucao: 'comparei alternativas com custos do motor', investigar_causa: 'cruzei dados para montar o dossiê de causa-raiz', executar_lote_zero_touch: 'processei somente casos autônomos', abrir_chamado_transportadora: 'preparei o chamado e evidências de SLA', redigir_mensagem_cliente: 'preparei o contexto e a política de comunicação', escalar_para_humano: 'encaminhei decisão que exige alçada humana' };
  return `${role}: ${purpose[name] ?? `consultei ${name}`} para avançar a rotina.`;
};
const stringifyToolResult = (result: unknown) => JSON.stringify(result).slice(0, 9000);
function communicationTraces(result: unknown) {
  if (!result || typeof result !== 'object') return [];
  const record = result as Record<string, unknown>;
  const traces = Array.isArray(record.comunicacoes) ? record.comunicacoes : record.comunicacao ? [record.comunicacao] : [];
  return traces.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
}
function validateArgumentText(value: unknown, results: unknown[], onInvalid: () => Promise<void>): Promise<unknown> {
  if (typeof value === 'string') {
    const checked = validateAgentText(value, results);
    return checked.valid ? Promise.resolve(value) : onInvalid().then(() => checked.text);
  }
  if (Array.isArray(value)) return Promise.all(value.map(item => validateArgumentText(item, results, onInvalid)));
  if (value && typeof value === 'object') return Promise.all(Object.entries(value).map(async ([key, item]) => [key, await validateArgumentText(item, results, onInvalid)] as const)).then(Object.fromEntries);
  return Promise.resolve(value);
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const maxSteps = Math.min(6, Math.max(1, options.maxSteps ?? 6));
  const roleGuide = Object.entries(ROLES).map(([role, definition]) => `${role}: ${definition.prompt} Alçada: ${definition.alçada} Tools: ${definition.tools.join(', ')}.`).join('\n');
  const messages: AgentMessage[] = [
    { role: 'system', content: `${ROLES.orquestrador.prompt}\n${roleGuide}\nDelegue pelo nome da tool; cada tool é executada pelo especialista indicado. Faça uma etapa por vez quando depender de resultado anterior. Não exponha raciocínio privado: a trilha mostra resumos de ação. Números e prazos só podem vir dos resultados das tools. Termine com um resumo sem inventar valores. Contexto determinístico enxuto: ${JSON.stringify(options.context)}` },
    { role: 'user', content: options.message },
  ];
  const steps: AgentStep[] = [];
  const results: unknown[] = [];
  let modelUsed = MODEL_PRIMARY;
  let fallbackModel = false;

  try {
    for (let round = 1; round <= maxSteps; round++) {
      let completion: AgentCompletion;
      try { completion = await options.callModel(modelUsed, messages, TOOL_DEFINITIONS); }
      catch (error) {
        if (!fallbackModel) { fallbackModel = true; modelUsed = MODEL_FALLBACK; completion = await options.callModel(modelUsed, messages, TOOL_DEFINITIONS); }
        else throw error;
      }
      if (!completion.toolCalls?.length) {
        const checked = validateAgentText(completion.content ?? '', results);
        if (!checked.valid) await options.onGuardrail?.(`Número não verificado removido; valores monetários: ${checked.invalidMoney.length}, prazos: ${checked.invalidPeriods.length}.`);
        return { modelUsed, text: checked.text || 'Concluí as consultas determinísticas. Veja a trilha de ações.', steps, guardrailTriggered: !checked.valid };
      }
      const calls = completion.toolCalls.slice(0, 8);
      messages.push({ role: 'assistant', tool_calls: calls.map(call => ({ id: call.id, type: 'function', function: call.function })) });
      for (const call of calls) {
        const role = TOOL_ROLE[call.function.name];
        let args: Record<string, unknown> = {};
        let result: unknown;
        if (!role) result = { error: 'Ferramenta não permitida.' };
        else {
          try {
            const decoded = JSON.parse(call.function.arguments) as unknown;
            if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Argumentos devem ser um objeto.');
            args = await validateArgumentText(decoded, results, async () => options.onGuardrail?.('Número não verificado removido dos argumentos enviados pela IA.') ?? Promise.resolve()) as Record<string, unknown>;
            const permitted = ROLES[role].tools.includes(call.function.name);
            result = permitted ? await options.runTool(call.function.name, args) : { error: `A ferramenta ${call.function.name} não é permitida para ${role}.` };
          } catch (error) { result = { error: error instanceof Error ? error.message : 'Argumentos inválidos.' }; }
        }
        results.push(result);
        const step: AgentStep = { round, papel: role ?? 'orquestrador', pensamentoResumido: safeSummary(call.function.name, role ?? 'orquestrador', result), tool: call.function.name, argumentos: args, resultado: result };
        steps.push(step);
        for (const communication of communicationTraces(result)) {
          steps.push({ round, papel: 'comunicacao', pensamentoResumido: 'comunicacao: redigi um rascunho a partir dos fatos do motor e registrei o modelo usado.', tool: 'subagente_comunicacao', argumentos: { canal: communication.canal, fatosDoMotor: communication.entradaFatos }, resultado: communication });
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: stringifyToolResult(result) });
      }
    }
    const fallbackText = 'Concluí o limite de etapas. A trilha contém as consultas e ações persistidas; use os resultados determinísticos para a decisão final.';
    const checked = validateAgentText(fallbackText, results);
    return { modelUsed, text: checked.text, steps, guardrailTriggered: !checked.valid };
  } catch {
    return options.deterministicFallback();
  }
}

export function validateFinalText(text: string, results: unknown[]) { return validateAgentText(text, results); }
