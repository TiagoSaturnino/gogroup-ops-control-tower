import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  module._compile(output, filename);
};

const demo = process.argv.includes('--demo');
const privatePath = path.join(process.cwd(), 'data', 'private', 'snapshot_2000.json');
const sourcePath = !demo && fs.existsSync(privatePath) ? privatePath : path.join(process.cwd(), 'data', 'demo_fallback.json');
const dataset = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const { runEngine } = require(path.join(process.cwd(), 'lib', 'engine.ts'));
const { ZERO_TOUCH_MINUTES_SAVED } = require(path.join(process.cwd(), 'lib', 'params.ts'));
const base = runEngine(dataset.orders, { routes: dataset.routes });
const run = (params = {}) => runEngine(dataset.orders, { ...params, routes: dataset.routes });
const round = value => Number(value.toFixed(2));
const describe = result => ({
  pedidos: result.totals.pedidos,
  gmv: round(result.totals.gmv),
  evRisco: round(result.totals.evRisco),
  ltvEmRisco: round(result.orders.reduce((sum, order) => sum + order.perda_ltv_12m, 0)),
  zeroTouchElegiveis: result.totals.zeroTouch,
  zeroTouchElegiveisPercent: round(result.totals.zeroTouch / Math.max(1, result.totals.pedidos) * 100),
  horasZeroTouchTeoricasMotor: round(result.totals.zeroTouchHoursSaved),
  zeroTouchAutonomosSemAlcada: result.orders.filter(order => order.isZeroTouch && !order.requerAlcadaHumana).length,
  zeroTouchAutonomosPercent: round(result.orders.filter(order => order.isZeroTouch && !order.requerAlcadaHumana).length / Math.max(1, result.totals.pedidos) * 100),
  horasZeroTouchAutonomas: round(result.orders.filter(order => order.isZeroTouch && !order.requerAlcadaHumana).length * ZERO_TOUCH_MINUTES_SAVED / 60),
  capacidadeDia: result.params.capacidadeDiaria,
  dia1: {
    fifoPedidos: result.comparison.fifo.count,
    fifoGmv: round(result.comparison.fifo.gmvCovered),
    fifoEvRisco: round(result.comparison.fifo.evRiscoProtected),
    fifoVip: result.comparison.fifo.vipsAttended,
    aiFirstPedidos: result.comparison.aiFirst.count,
    aiFirstGmv: round(result.comparison.aiFirst.gmvCovered),
    aiFirstEvRisco: round(result.comparison.aiFirst.evRiscoProtected),
    aiFirstVip: result.comparison.aiFirst.vipsAttended,
    deltaEvRiscoAiFirstVsFifo: round(result.comparison.aiFirst.evRiscoProtected - result.comparison.fifo.evRiscoProtected),
  },
  diasParaZerar: result.comparison.burndown.daysToClear,
});
const sensitivity = {
  capacidade: [100, 150, 200].map(capacidadeDiaria => ({ capacidadeDiaria, ...describe(run({ capacidadeDiaria })) })),
  abandonoPagamento: [0.1, 0.3, 0.5].map(probAbandonoPagamento => ({ probAbandonoPagamento, ...describe(run({ probAbandonoPagamento })) })),
  tetoRuptura: [0.2, 0.4, 0.6].map(tetoRuptura => ({ tetoRuptura, ...describe(run({ tetoRuptura })) })),
};
const output = { fonte: path.relative(process.cwd(), sourcePath), premissasMotor: base.params, totais: describe(base), causas: base.systemic.map(cause => ({ id: cause.id, nome: cause.title, pedidos: cause.count, economiaEstimada: round(cause.economiaEstimada) })), sensibilidade: sensitivity };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
