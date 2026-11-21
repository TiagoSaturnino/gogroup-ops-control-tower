import { getActionStore, type ActionStore } from './store';

export type HealthStatus = {
  store: 'redis' | 'memoria';
  modelo: 'groq' | 'deterministic';
  telegram: 'configurado' | 'nao_configurado';
};

export function getHealthStatus(
  store: ActionStore = getActionStore(),
  env: Record<string, string | undefined> = process.env,
): HealthStatus {
  return {
    store: store.kind === 'upstash' ? 'redis' : 'memoria',
    modelo: env.GROQ_API_KEY ? 'groq' : 'deterministic',
    telegram: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET && env.TELEGRAM_TEAM_CHAT_ID && env.TELEGRAM_DEMO_CUSTOMER_CHAT_ID
      ? 'configurado'
      : 'nao_configurado',
  };
}
