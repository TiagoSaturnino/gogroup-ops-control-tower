# Torre de Controle AI-First — Operações GoGroup

**Operações Gocase & GoBeauté**

## 1. Visão Geral & Problema de Negócio

A operação reúne exceções de entrega, pagamento, endereço, produto e personalização numa fila que, sem priorização, é atendida em ordem FIFO (first in, first out). A base original contém **2.042 registros** que representam **2.000 pedidos únicos** após deduplicar **42 registros duplicados por status**. Com capacidade de **150 tratativas por dia** e estimativa de **12 minutos por caso**, o time dispõe de aproximadamente **30 horas de capacidade operacional diária**.

O conjunto concentra **R$ 220.161,37 em GMV exposto** e **R$ 42.016,44 de LTV de 12 meses em risco**. A Torre de Controle ordena a fila pelo `EV_Risco` calculado para cada pedido, evidencia causas-raiz recorrentes e destaca ações automatizáveis e situações que exigem alçada humana.

| Indicador da base de referência | Valor |
| --- | ---: |
| Registros recebidos | 2.042 |
| Pedidos únicos | 2.000 |
| Duplicatas removidas por status | 42 |
| Capacidade diária de tratativas | 150 casos |
| Tempo médio considerado por caso | 12 minutos |
| Capacidade diária equivalente | 30 horas |
| GMV exposto | R$ 220.161,37 |
| LTV de 12 meses em risco | R$ 42.016,44 |

## 2. Diagnóstico Quantitativo & As 6 Causas-Raiz Sistêmicas

| Causa-raiz | Evidência quantitativa | Leitura operacional |
| --- | ---: | --- |
| Bug no checkout: promessa em dias corridos vs. dias úteis | **1.822 promessas encurtadas**; **147 pedidos atrasados entregues dentro do SLA real** | O prazo mostrado no checkout não refletiu o calendário de dias úteis. O motor considera fins de semana e os feriados de **07/09** e **12/10** ao recalcular a promessa. |
| CD2, turno da noite: `item_faltante` | **210 de 278 casos**, com concentração em pedidos com brinde | Auditar conferência e separação de itens e brindes no CD2 durante o turno noturno. |
| Colapso da `Rota Express` no Nordeste | **396 casos** de atraso ou rastreio parado | Incidência na rota Nordeste (BA, PE, CE, RN, PB, MA, AL, PI e SE). Comparar capacidade e SLA com Veloz Log e Entrega Já. |
| Vazamento do lote `L2607-B`, SKU `APC-1067` | **74 de 111 casos** | Conter o lote e inspecionar o SKU afetado para impedir novos envios com vazamento. |
| Descalibração da impressora `IMP-02` | **77 de 130 falhas** de personalização Gocase | Calibrar o equipamento e revisar pedidos personalizados associados à impressora. |
| Avarias `Carga Norte` e ruptura de Kokeshi | **98 de 186 avarias** da Carga Norte; **59 de 121 rupturas** de Kokeshi | Investigar acondicionamento e transporte com a transportadora, além da disponibilidade de Kokeshi. |

As contagens acima descrevem a base de referência. Ao carregar outro conjunto, o dashboard recalcula as ocorrências com o motor determinístico.

## 3. Impacto da Priorização AI-First (`EV_Risco`) vs. FIFO

### Automação Zero-Touch

Dos 2.000 pedidos, **500 casos (25,0%)** são elegíveis para automação determinística:

| Categoria | Casos |
| --- | ---: |
| Atrasos já entregues | 234 |
| Pagamentos pendentes | 141 |
| Endereços divergentes | 125 |
| **Total Zero-Touch** | **500** |

Com 12 minutos estimados por caso, a automação libera **100,0 horas humanas**, equivalentes a **3,33 dias de capacidade da equipe** a 150 tratativas por dia.

### Dia 1 — Top 150

| Métrica | FIFO | AI-First | Variação |
| --- | ---: | ---: | ---: |
| GMV coberto | R$ 17.018,66 | R$ 37.285,59 | **+119,1%** |
| `EV_Risco` protegido | R$ 12.022,15 | R$ 32.298,47 | **+168,7%** |
| VIPs atendidos | 11 | 28 | **+17 VIPs** |

A priorização AI-First reduz desperdício de capacidade: **32 slots do FIFO** estavam ocupados por pedidos já entregues. O comparativo de VIPs atendidos fica visível no card **Ganho Dia 1 • Top 150** e no badge do gráfico. O gráfico principal compara apenas GMV coberto e `EV_Risco` protegido, ambos em reais.

## 4. Arquitetura Técnica & Governança do Agente

### Stack

- **Next.js 16** com App Router e **TypeScript**;
- **Tailwind CSS** para estilos da interface;
- **Recharts** para os gráficos operacionais;
- **Groq API** com `llama-3.3-70b-versatile`, fallback de modelo para `llama-3.1-8b-instant` e fallback determinístico em TypeScript.

### Componentes e fluxo

1. `scripts/prepare_snapshot.mjs` importa CSVs, deduplica registros por pedido/status, anonimiza identificadores e prepara os conjuntos privado e de demonstração.
2. `lib/engine.ts` é a fonte única de cálculo determinístico: calcula valores financeiros em reais, prazos em dias úteis, score `EV_Risco`, elegibilidade Zero-Touch, alçadas, causas sistêmicas e a comparação FIFO/AI-First.
3. `lib/tools.ts` carrega os dados no servidor e expõe as operações determinísticas usadas pelas APIs.
4. `app/api/operations` entrega o dashboard e recalcula dados enviados em memória. `app/api/agent` apresenta ferramentas ao modelo Groq e aplica o fallback determinístico.
5. `components/control-tower.tsx` apresenta indicadores, simulador de capacidade, fila priorizada, causas-raiz, upload CSV e trilha de auditoria da sessão.

### Separação de responsabilidades e ferramentas

O motor TypeScript calcula **100% dos valores financeiros e prazos**. O LLM não calcula nem inventa números: interpreta a solicitação, escolhe uma ferramenta disponível e redige justificativas ou rascunhos de mensagem com base nos resultados calculados.

| Ferramenta | Responsabilidade |
| --- | --- |
| `executar_lote_zero_touch` | Processar casos elegíveis de atraso já entregue, pagamento pendente ou endereço divergente. |
| `resolver_pedido_individual` | Preparar o encaminhamento de um pedido e aplicar as regras de alçada correspondentes. |
| `aplicar_acao_sistemica` | Preparar ação para uma causa-raiz; requer validação humana. |
| `simular_premissas_e_capacidade` | Recalcular cenário com capacidade, abandono de pagamento e teto de ruptura informados. |

### Matriz de alçada

| Situação | Regra de governança |
| --- | --- |
| Cliente VIP | `LTV > R$ 1.500`: requer alçada humana. |
| Reembolso / pedido de alto valor | Valor acima de **R$ 250**: requer alçada humana. |
| `ruptura_pos_venda` | Requer alçada humana, independentemente do valor. |
| Ações estruturais ou sistêmicas | Requerem validação do responsável operacional. |
| Ações executadas pelo agente | Permanecem sujeitas às travas determinísticas; decisões não aprovadas não são executadas externamente. |

As aprovações exibidas são registradas na trilha da sessão do navegador. A API prepara e registra resultados, mas não executa ações em sistemas externos.

## 5. Privacidade & Como Executar Localmente

### Privacidade

- Nenhum CSV bruto ou dado confidencial deve ser versionado no Git. `data/raw/`, `data/private/`, CSVs, PDFs, arquivos ZIP e arquivos `.env*` são ignorados pelo Git.
- `data/private/snapshot_2000.json` contém dados operacionais anonimizados e é consumido somente no servidor. Nunca copie dados reais para `public/`, commits, logs ou respostas públicas.
- O deploy inclui dados privados apenas no bundle necessário às funções de API, fora de `public/`.
- `data/demo_fallback.json` contém dados sintéticos para iniciar o projeto sem acesso ao snapshot privado.
- O upload de CSV pela interface é processado na sessão; identificadores são anonimizados antes do envio à API, e os arquivos não são persistidos em disco.

### Execução local

Com Node.js e npm instalados, na raiz do repositório:

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`. O projeto utiliza `data/demo_fallback.json` quando o snapshot privado não está disponível. Para recalcular uma operação com dados próprios, carregue os CSVs pela interface (`pedidos_excecao.csv`, `clientes.csv` e `transportadoras.csv`); eles são processados em memória para a sessão.

Para preparar o snapshot a partir dos arquivos operacionais locais e validar o projeto:

```bash
node scripts/prepare_snapshot.mjs
npx vitest run
npm run build
```

## Tecnologias

Next.js 16, React, TypeScript, Tailwind CSS, Recharts, PapaParse, Groq SDK e Vitest.
