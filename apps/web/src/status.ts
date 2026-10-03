import type { Incident, StationStatus } from './types';

export interface StatusMeta {
  label: string;
  short: string;
  hint: string;
}

export const STATUS_META: Record<StationStatus, StatusMeta> = {
  running: {
    label: 'Работает',
    short: 'Работает',
    hint: 'Станция обрабатывает изделие.',
  },
  idle: {
    label: 'Ожидание',
    short: 'Ожидание',
    hint: 'Нет изделий на входе, станция ждёт заготовку. Не считается простоем оборудования.',
  },
  blocked: {
    label: 'Блокировка выхода',
    short: 'Блокировка',
    hint: 'Изделие готово, но буфер следующего этапа заполнен. Не считается простоем оборудования.',
  },
  stopped: {
    label: 'Остановлена',
    short: 'Остановлена',
    hint: 'Оборудование остановлено — это учитывается как простой.',
  },
  warning: {
    label: 'Предупреждение',
    short: 'Внимание',
    hint: 'Отклонение в работе оборудования: возможно замедление.',
  },
};

export const STATUS_ORDER: readonly StationStatus[] = ['running', 'idle', 'blocked', 'stopped', 'warning'];

export const SEVERITY_LABEL: Record<Incident['severity'], string> = {
  warning: 'Предупреждение',
  critical: 'Критический',
};
