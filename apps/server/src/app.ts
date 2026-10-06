import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { parseProductionConfig, type ProductionConfig } from '@driveindui/shared';
import { SessionError, SessionStore } from './sessions.js';
import { AiError, AiService, aiInputSchema } from './ai.js';

const controlSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('play') }).strict(),
  z.object({ action: z.literal('pause') }).strict(),
  z.object({ action: z.literal('reset') }).strict(),
  z.object({ action: z.literal('setSpeed'), speed: z.union([z.literal(1), z.literal(10), z.literal(60)]) }).strict(),
  z.object({ action: z.literal('setScenario'), scenario: z.enum(['normal', 'equipment', 'bottleneck']) }).strict(),
  z.object({ action: z.literal('setConfiguration'), config: z.unknown().transform((value, ctx): ProductionConfig => {
    const result = parseProductionConfig(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.issues.map(issue => `${issue.path}: ${issue.message}`).join('; ') });
      return z.NEVER;
    }
    return result.value;
  }) }).strict(),
]);

const comparisonSchema = z.object({
  maintenanceMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  reserveSetupMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]),
}).strict();

export async function buildApp(options: { store?: SessionStore; ai?: AiService; autoTick?: boolean; logger?: boolean; publicDir?: string | false } = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 4096 });
  const store = options.store ?? new SessionStore();
  const ai = options.ai ?? new AiService();
  const aiOrigins = new Set((process.env.AI_ALLOWED_ORIGINS ?? 'https://zardol.github.io,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:3001,http://127.0.0.1:3001').split(',').map(value => value.trim()).filter(Boolean));
  if (process.env.RENDER_EXTERNAL_HOSTNAME) aiOrigins.add(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/ai/')) return;
    const origin = request.headers.origin;
    if (origin && !aiOrigins.has(origin)) return reply.status(403).send({ error: 'AI_ORIGIN_DENIED', message: 'Этот сайт не подключён к ИИ-сервису.' });
    if (origin) reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS').header('Access-Control-Allow-Headers', 'Content-Type, X-AI-Access');
    if (request.method === 'OPTIONS') return reply.status(204).send();
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof SessionError || error instanceof AiError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: 'INVALID_REQUEST', message: 'Некорректный запрос.' });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Не удалось обработать запрос. Повторите попытку.' });
  });

  app.get('/api/health', async () => ({ status: 'ok', version: '0.9.0', dataMode: 'organizer-test-simulation' }));
  app.get('/api/ai/status', async request => {
    const code = typeof request.headers['x-ai-access'] === 'string' ? request.headers['x-ai-access'] : undefined;
    if (code !== undefined) ai.authorize(code, request.ip);
    const status = ai.status(request.ip);
    return { ...status, authorized: !status.accessRequired || Boolean(code) };
  });
  app.post('/api/ai/analysis', { bodyLimit: 16384 }, async (request, reply) => {
    ai.authorize(typeof request.headers['x-ai-access'] === 'string' ? request.headers['x-ai-access'] : undefined, request.ip);
    const input = aiInputSchema.safeParse(request.body);
    if (!input.success) return reply.status(400).send({ error: 'AI_INVALID_INPUT', message: 'Некорректный набор производственных показателей.' });
    return ai.analyze(input.data, request.ip);
  });

  app.post('/api/sessions', async (request, reply) => {
    if (!z.object({}).strict().safeParse(request.body ?? {}).success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'Для создания сессии передайте пустой объект.' });
    }
    return reply.status(201).send(store.create());
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request) => store.get(request.params.id));

  app.post<{ Params: { id: string } }>('/api/sessions/:id/control', async (request, reply) => {
    const parsed = controlSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_CONTROL', message: 'Недопустимая команда или конфигурация. Проверьте файл перед применением.' });
    return store.control(request.params.id, parsed.data);
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/comparison', async (request, reply) => {
    const parsed = comparisonSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_COMPARISON', message: 'Выберите допустимую длительность обслуживания и подключения резерва.' });
    return store.compare(request.params.id, parsed.data);
  });

  const publicDir = options.publicDir === false ? false : (options.publicDir ?? resolve('dist/public'));
  if (publicDir && existsSync(publicDir)) {
    await app.register(staticFiles, { root: publicDir, index: 'index.html', dotfiles: 'deny', list: false });
  }
  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: 'NOT_FOUND', message: 'Адрес не найден.' }));

  if (options.autoTick !== false) {
    const timer = setInterval(() => store.tick(), 250);
    timer.unref();
    app.addHook('onClose', async () => { clearInterval(timer); });
  }
  return app;
}
