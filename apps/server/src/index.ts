import { buildApp } from './app.js';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

// npm workspace dev runs from apps/server; the bundled production server runs from the repository root.
const envFile = resolve(existsSync('src/app.ts') && existsSync('../../package.json') ? '../../.env' : '.env');
if (existsSync(envFile)) {
  loadEnvFile(envFile);
  process.env.AI_LEDGER_PATH = resolve(dirname(envFile), process.env.AI_LEDGER_PATH ?? '.local/ai-usage.json');
}

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const app = await buildApp({ logger: true });
try {
  await app.listen({ host: process.env.HOST ?? '0.0.0.0', port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
