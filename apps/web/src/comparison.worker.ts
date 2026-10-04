import { compareEngine, type Engine } from '@driveindui/simulation';
import type { ComparisonOptions, SessionComparison } from '@driveindui/shared';

export interface ComparisonJob {
  engine: Engine;
  sessionId: string;
  revision: number;
  options: ComparisonOptions;
}
export type ComparisonReply = { result: SessionComparison } | { error: string };

self.onmessage = (event: MessageEvent<ComparisonJob>) => {
  const { engine, options, sessionId, revision } = event.data;
  let reply: ComparisonReply;
  try {
    reply = { result: { ...compareEngine(engine, options), sessionId, revision } };
  } catch {
    reply = { error: 'Не удалось рассчитать варианты. Повторите попытку.' };
  }
  self.postMessage(reply);
};
