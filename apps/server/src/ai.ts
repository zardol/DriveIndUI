import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { AI_MODEL, AI_STATION_NAMES, CANONICAL_STATION_IDS, CASE_DOWNTIMES, CASE_LINES, CASE_TARGETS, calculateAiIndicators, type AiAnalysis, type AiInput, type AiReport } from '@driveindui/shared';

const stationId = z.enum(['welding', 'painting', 'assembly', 'quality']);
const bounded = (max: number) => z.number().finite().min(0).max(max);
export const aiInputSchema = z.object({
  version: z.literal(1), includeCaseHistory: z.boolean(), elapsedSeconds: bounded(86400).int(), shiftSeconds: z.number().int().min(60).max(86400),
  shiftPlan: bounded(100000).int(), goodUnits: bounded(100000).int(), rejectedUnits: bounded(100000).int(), wip: bounded(10000).int(),
  remainingOrderUnits: bounded(100000).int(), unallocatedMonthlyUnits: bounded(100000).int(),
  supplyIntervalSeconds: z.number().min(1).max(86400), rejectRate: bounded(.5), horizonMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  stations: z.array(z.object({ id: stationId, status: z.enum(['running', 'idle', 'blocked', 'stopped', 'warning']),
    inputQueue: bounded(1000).int(), bufferCapacity: z.number().int().min(1).max(1000), cycleSeconds: z.number().min(1).max(86400),
    utilizationPercent: bounded(100), downtimeSeconds: bounded(86400).int(),
  }).strict()).length(4),
}).strict().superRefine((value, ctx) => {
  if (value.elapsedSeconds > value.shiftSeconds || value.stations.some((station, i) => station.id !== CANONICAL_STATION_IDS[i]
    || station.inputQueue > station.bufferCapacity || station.downtimeSeconds > value.elapsedSeconds)) {
    ctx.addIssue({ code: 'custom', message: 'Inconsistent production observations' });
  }
});
const text = (max: number) => z.string().min(1).max(max);
const reportSchema = z.object({
  summary: text(600),
  findings: z.array(z.object({ stationId: z.enum(['welding', 'painting', 'assembly', 'quality', 'line']),
    kind: z.enum(['downtime', 'bottleneck', 'plan', 'quality']), level: z.enum(['low', 'medium', 'high']),
    title: text(120), evidence: text(600), forecast: text(600), action: text(500), confidence: z.enum(['low', 'medium']),
  }).strict()).min(1).max(4),
  nextSteps: z.array(text(300)).min(1).max(3), limitation: text(600),
}).strict();
const jsonText = { type: 'string' };
const reportJsonSchema = {
  type: 'object', additionalProperties: false, required: ['summary', 'findings', 'nextSteps', 'limitation'],
  properties: {
    summary: jsonText,
    findings: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', additionalProperties: false,
      required: ['stationId', 'kind', 'level', 'title', 'evidence', 'forecast', 'action', 'confidence'], properties: {
        stationId: { type: 'string', enum: ['welding', 'painting', 'assembly', 'quality', 'line'] },
        kind: { type: 'string', enum: ['downtime', 'bottleneck', 'plan', 'quality'] }, level: { type: 'string', enum: ['low', 'medium', 'high'] },
        title: jsonText, evidence: jsonText, forecast: jsonText, action: jsonText,
        confidence: { type: 'string', enum: ['low', 'medium'] },
      } } },
    nextSteps: { type: 'array', minItems: 1, maxItems: 3, items: jsonText }, limitation: jsonText,
  },
};
const instructions = `Ты аналитик цифрового двойника DriveIndUI. Ответ только по-русски, кратко, для руководителя смены.
Проанализируй риск потенциального простоя, переполнения буферов и ограничение выпуска на указанный горизонт. Приоритет — 1–4 конкретных риска и 1–3 следующих действия.
Если caseHistory содержит неплановые простои и смена ещё не завершена, обязательно включи один finding kind=downtime: какой механизм из истории стоит проверить до повторения, с низкой уверенностью. Не утверждай, что повторение обязательно произойдёт или произойдёт в этот горизонт.
Текущие данные относятся к симуляции; caseHistory — отдельные тестовые агрегаты организатора за два дня, а не телеметрия этой смены. Не смешивай эти источники в одном фактическом показателе.
indicators — детерминированная оценка при неизменной мощности. Это не предсказание обученной модели. Ссылайся на численные основания из входа. Не выдумывай датчики, частоты отказов, вероятности, будущие события или время ремонта.
Действующая остановка — наблюдение, а не предсказанный отказ. Низкая уверенность для повторения исторического отказа; средняя возможна для расчётного ограничения мощности или очереди. Не давай высокую уверенность.
События разных дней и оборудования нельзя складывать в простой одного станка. Порог 60 минут/сутки применим только к критическому оборудованию, классификация неизвестна. Плановое ТО не является аварийным отказом.
Не суммируй выпуск последовательных участков или дефекты разных стадий в выпуск/брак завода. OEE не известен без идеального цикла. Связь фильтра с браком не доказана.
Если remainingOrderUnits равен 0 или shiftEnded, не прогнозируй накопление очереди и не объявляй недостижимую текущую цель новым будущим риском: предложи подготовить следующую смену. Неназначенные заказы — самостоятельный риск плана.
Для каждого finding: title до 80 знаков; evidence, forecast, action по одному короткому предложению (до 260 знаков). summary до 260 знаков. Используй названия показателей на русском, никогда не показывай имена JSON-полей. Округляй числа до одного десятичного знака; для срока заполнения за пределами горизонта пиши «вне горизонта», а не огромное число минут.
Отделяй факт, прогноз-гипотезу и проверяемое действие. Никаких инструкций автоматически менять производственную линию.
limitation: одно короткое объяснение, почему двух дней без телеметрии недостаточно для статистически подтверждённого прогноза отказов. Не называй LLM обученной на заводе моделью.`;

export class AiError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) { super(message); }
}
interface AiServiceOptions {
  apiKey?: string; accessToken?: string; ledgerPath?: string | false; maxCalls?: number; fetcher?: typeof fetch; now?: () => number;
}
/** Conservative reservation: each attempted call spends one slot, even on timeout. No automatic paid retries. */
export class AiService {
  private readonly apiKey: string;
  private readonly accessToken: string;
  private readonly ledgerPath: string | false;
  private readonly maxCalls: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private calls = 0;
  private ledgerHealthy = true;
  private cache = new Map<string, { at: number; value: AiAnalysis }>();
  private inFlight = new Map<string, Promise<AiAnalysis>>();
  private clients = new Map<string, number>();
  constructor(options: AiServiceOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.accessToken = options.accessToken ?? process.env.AI_ACCESS_TOKEN ?? '';
    this.ledgerPath = options.ledgerPath === false ? false : resolve(options.ledgerPath ?? process.env.AI_LEDGER_PATH ?? '.local/ai-usage.json');
    const requested = Number(options.maxCalls ?? process.env.AI_MAX_CALLS ?? 150);
    this.maxCalls = Number.isInteger(requested) && requested >= 1 && requested <= 150 ? requested : 150;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    if (this.ledgerPath && existsSync(this.ledgerPath)) {
      try { const saved = JSON.parse(readFileSync(this.ledgerPath, 'utf8')); if (!Number.isSafeInteger(saved.calls) || saved.calls < 0) throw new Error(); this.calls = saved.calls; }
      catch { this.ledgerHealthy = false; }
    }
  }
  status(remoteAddress: string) {
    return { configured: Boolean(this.apiKey) && this.ledgerHealthy, model: AI_MODEL,
      accessRequired: Boolean(this.accessToken) || !this.isLoopback(remoteAddress) };
  }
  private isLoopback(address: string) { return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address); }
  authorize(token: string | undefined, address: string) {
    if (!this.accessToken && this.isLoopback(address)) return;
    const actual = Buffer.from(token ?? ''); const expected = Buffer.from(this.accessToken);
    if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new AiError(401, 'AI_ACCESS_REQUIRED', 'Для ИИ-анализа нужен код доступа к серверу.');
    }
  }
  private reserve() {
    if (!this.ledgerHealthy) throw new AiError(503, 'AI_LEDGER_ERROR', 'Не удалось проверить лимит запросов. Требуется настройка сервера.');
    const limit = () => { if (this.calls >= this.maxCalls) throw new AiError(429, 'AI_BUDGET_LIMIT', 'Достигнут лимит ИИ-анализов для демонстрации.'); };
    if (this.ledgerPath) {
      let lock: number | undefined;
      try {
        mkdirSync(dirname(this.ledgerPath), { recursive: true });
        lock = openSync(`${this.ledgerPath}.lock`, 'wx', 0o600);
        if (existsSync(this.ledgerPath)) {
          const saved = JSON.parse(readFileSync(this.ledgerPath, 'utf8'));
          if (!Number.isSafeInteger(saved.calls) || saved.calls < 0) throw new Error('Invalid ledger');
          this.calls = saved.calls;
        }
        limit();
        writeFileSync(`${this.ledgerPath}.tmp`, JSON.stringify({ calls: this.calls + 1, model: AI_MODEL, updatedAt: new Date(this.now()).toISOString() }), { mode: 0o600 });
        renameSync(`${this.ledgerPath}.tmp`, this.ledgerPath);
      } catch (error) {
        if (error instanceof AiError) throw error;
        throw new AiError(503, 'AI_LEDGER_ERROR', 'Не удалось сохранить счётчик лимита. Запрос к OpenAI не отправлен.');
      } finally { if (lock !== undefined) { closeSync(lock); unlinkSync(`${this.ledgerPath}.lock`); } }
    } else limit();
    this.calls++;
  }
  async analyze(input: AiInput, client: string): Promise<AiAnalysis> {
    if (!this.apiKey) throw new AiError(503, 'AI_NOT_CONFIGURED', 'OpenAI ещё не подключён на сервере. Расчёт мощности доступен без подключения.');
    const key = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < 600_000) return { ...cached.value, cached: true };
    const pending = this.inFlight.get(key); if (pending) return pending;
    if (this.inFlight.size >= 2) throw new AiError(429, 'AI_BUSY', 'Сервис выполняет два анализа. Повторите чуть позже.');
    const previous = this.clients.get(client);
    if (previous !== undefined && this.now() - previous < 30_000) throw new AiError(429, 'AI_RATE_LIMIT', 'Новый анализ доступен через 30 секунд после предыдущего.');
    this.reserve();
    this.clients.set(client, this.now());
    for (const [id, at] of this.clients) if (this.now() - at >= 60_000) this.clients.delete(id);
    const task = this.generate(input).then(value => {
      this.cache.set(key, { at: this.now(), value });
      if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!);
      return value;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }
  private async generate(input: AiInput): Promise<AiAnalysis> {
    const indicators = calculateAiIndicators(input);
    const payload = JSON.stringify({ observations: input, indicators, stationNames: AI_STATION_NAMES,
      caseHistory: input.includeCaseHistory ? { source: 'Тестовые данные организатора, 1–2 октября 2026', lines: CASE_LINES, downtimes: CASE_DOWNTIMES, targets: CASE_TARGETS } : null });
    // A 24 KB UTF-8 prompt limit plus 3000 output tokens bounds exposure to well below $0.10/call at documented rates.
    if (Buffer.byteLength(instructions + payload) > 24_000) throw new AiError(400, 'AI_INPUT_TOO_LARGE', 'Слишком большой набор показателей.');
    let response: Response;
    try {
      response = await this.fetcher('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: AI_MODEL, store: false, instructions, input: payload,
          reasoning: { effort: 'low' }, max_output_tokens: 3000,
          text: { format: { type: 'json_schema', name: 'production_risk_report', strict: true, schema: reportJsonSchema } },
        }), signal: AbortSignal.timeout(60_000),
      });
    } catch { throw new AiError(504, 'AI_TIMEOUT', 'OpenAI не ответил вовремя. Повторите анализ позже.'); }
    if (!response.ok) {
      // Never expose upstream response bodies, auth headers, organization identifiers or keys.
      if (response.status === 429) throw new AiError(503, 'AI_PROVIDER_LIMIT', 'OpenAI отклонил запрос из-за лимита или баланса. Проверьте проект OpenAI Platform.');
      if ([401, 403, 404].includes(response.status)) throw new AiError(503, 'AI_PROVIDER_CONFIG', 'Проверьте API-ключ и доступ проекта к модели OpenAI.');
      throw new AiError(502, 'AI_PROVIDER_ERROR', 'Сервис OpenAI временно недоступен.');
    }
    let data: { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    try { data = await response.json(); } catch { throw new AiError(502, 'AI_INVALID_RESPONSE', 'OpenAI вернул некорректный ответ.'); }
    const output = data.output?.filter(item => item.type === 'message').flatMap(item => item.content ?? []).filter(item => item.type === 'output_text').map(item => item.text ?? '').join('');
    if (data.status !== 'completed' || !output) throw new AiError(502, 'AI_INCOMPLETE', 'Анализ не завершён. Готовый прогноз не получен.');
    let report: AiReport;
    try { report = reportSchema.parse(JSON.parse(output)); } catch { throw new AiError(502, 'AI_INVALID_RESPONSE', 'Ответ OpenAI не прошёл проверку структуры.'); }
    const inputTokens = data.usage?.input_tokens ?? 0; const outputTokens = data.usage?.output_tokens ?? 0;
    if (![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) throw new AiError(502, 'AI_INVALID_RESPONSE', 'Некорректные данные расхода API.');
    return { report, input, indicators, model: AI_MODEL, createdAt: new Date(this.now()).toISOString(), cached: false,
      usage: { inputTokens, outputTokens, estimatedCostUsd: (inputTokens * 2 + outputTokens * 10) / 1_000_000 } };
  }
}
