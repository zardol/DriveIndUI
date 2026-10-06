export const WORKSPACES = [
  { id: 'overview', title: 'Обзор смены', label: 'Обзор', caption: 'Показатели и отклонения', number: '01' },
  { id: 'factory', title: 'Производственный цех', label: 'Цех', caption: 'Оборудование, машины и очереди', number: '02' },
  { id: 'plan', title: 'Производственный план', label: 'План', caption: 'Заказы на месяц и квоты смены', number: '03' },
  { id: 'decisions', title: 'Сравнение решений', label: 'Решения', caption: 'Эффект до конца текущей смены', number: '04' },
  { id: 'data', title: 'Данные и настройки', label: 'Данные', caption: 'Источники, импорт и методика', number: '05' },
  { id: 'ai', title: 'ИИ · прогноз рисков', label: 'ИИ', caption: 'Простои, узкие места и рекомендации', number: '06' },
] as const;
export type WorkspacePage = typeof WORKSPACES[number]['id'];

/** Hash URLs also work from a static host or an unpacked offline demo. */
export function pageFromHash(hash: string): WorkspacePage {
  const value = hash.replace(/^#\/?/, '').split(/[?\/]/)[0];
  const legacy: Record<string, WorkspacePage> = { flow: 'factory', 'case-plan': 'plan', production: 'overview', incidents: 'overview', legend: 'data' };
  return WORKSPACES.find(page => page.id === value)?.id ?? legacy[value] ?? 'overview';
}
export function pageHref(page: WorkspacePage) { return `#/${page}`; }
