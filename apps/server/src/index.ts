import { buildApp } from './app.js';

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
