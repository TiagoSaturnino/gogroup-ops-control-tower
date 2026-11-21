const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '');

if (!token || !secret || !baseUrl) {
  console.error('Defina TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e APP_BASE_URL antes de registrar o webhook.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${baseUrl}/api/telegram`, secret_token: secret, allowed_updates: ['message', 'callback_query'] }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      console.error('O Telegram recusou o registro do webhook. Confira a URL pública e as variáveis, sem compartilhar o token.');
      process.exitCode = 1;
    } else console.log(`Webhook registrado: ${baseUrl}/api/telegram`);
  } catch {
    console.error('Não foi possível conectar à Bot API do Telegram. O token não foi exibido.');
    process.exitCode = 1;
  }
}
