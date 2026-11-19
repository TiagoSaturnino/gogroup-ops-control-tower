# Torre de Controle AI-First — Operações GoGroup

## Arquitetura
- `scripts/prepare_snapshot.mjs` ingere CSV com PapaParse, deduplica, anonimiza identificadores e produz snapshot privado e demo sintética.
- `data/private/snapshot_2000.json` contém dados anonimizados derivados da base operacional e é consumido apenas no servidor. Nunca copiar dados reais para `public/`, commits, logs ou respostas públicas.
- `lib/engine.ts` concentra regras financeiras, prazos úteis, score de risco, alçadas, causas sistêmicas e comparação FIFO/AI-First.
- `app/api/operations` entrega o dashboard ou recalcula em memória; `app/api/agent` oferece tools ao Groq com fallback determinístico.
- A interface usa Next.js App Router e TypeScript.

## Privacidade
Zero dados reais no Git. `data/raw/`, `data/private/`, CSV, PDFs, ZIPs e `.env*` são ignorados no Git. O deploy ignora os arquivos brutos, mas inclui `data/private/**` exclusivamente no bundle das funções de API, fora de `public/`.

## Regra de ouro
O motor determinístico em TypeScript calcula 100% dos valores em R$ e prazos. O LLM apenas escolhe ferramentas, aplica alçada e redige justificativas; nunca calcula nem inventa números financeiros ou prazos.

## Execução
`node scripts/prepare_snapshot.mjs`, `npx vitest run` e `npm run build`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
