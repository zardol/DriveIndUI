import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { SessionError, SessionStore } from './sessions.js';

const controlSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('play') }).strict(),
  z.object({ action: z.literal('pause') }).strict(),
  z.object({ action: z.literal('reset') }).strict(),
  z.object({ action: z.literal('setSpeed'), speed: z.union([z.literal(1), z.literal(10), z.literal(60)]) }).strict(),
  z.object({ action: z.literal('setScenario'), scenario: z.enum(['normal', 'equipment', 'bottleneck']) }).strict(),
]);

export async function buildApp(options: { store?: SessionStore; autoTick?: boolean; logger?: boolean; publicDir?: string | false } = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 4096 });
  const store = options.store ?? new SessionStore();

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof SessionError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: 'INVALID_REQUEST', message: 'Некорректный запрос.' });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Не удалось обработать запрос. Повторите попытку.' });
  });

  app.get('/api/health', async () => ({ status: 'ok', version: '0.1.0', dataMode: 'synthetic' }));

  app.post('/api/sessions', async (request, reply) => {
    if (!z.object({}).strict().safeParse(request.body ?? {}).success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'Для создания сессии передайте пустой объект.' });
    }
    return reply.status(201).send(store.create());
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request) => store.get(request.params.id));

  app.post<{ Params: { id: string } }>('/api/sessions/:id/control', async (request, reply) => {
    const parsed = controlSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_CONTROL', message: 'Недопустимая команда, скорость или сценарий.' });
    return store.control(request.params.id, parsed.data);
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
