import { locale } from './preferences';
import { t } from './i18n';
/** Смена начинается в 08:00 виртуального времени. */
const SHIFT_START_SECONDS = 8 * 3600;

function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Виртуальные часы смены: 08:00 + прошедшее время симуляции. */
export function formatClock(elapsedSeconds: number, withSeconds = true): string {
  const total = Math.max(0, Math.floor(safe(elapsedSeconds))) + SHIFT_START_SECONDS;
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return withSeconds ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}`;
}

/** Длительность в симуляционном времени: «1 ч 05 мин», «12 мин 30 с», «45 с». */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(safe(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return t(`${hours} ч ${pad(minutes)} мин`);
  if (minutes > 0) return t(`${minutes} мин ${pad(rest)} с`);
  return t(`${rest} с`);
}

const numberFormats = new Map<string, { integer: Intl.NumberFormat; one: Intl.NumberFormat }>();
function currentFormats() {
  const code = locale();
  let formats = numberFormats.get(code);
  if (!formats) {
    formats = { integer: new Intl.NumberFormat(code, { maximumFractionDigits: 0 }), one: new Intl.NumberFormat(code, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) };
    numberFormats.set(code, formats);
  }
  return formats;
}

export function formatInt(value: number): string {
  return currentFormats().integer.format(safe(value));
}

export function formatOne(value: number): string {
  return currentFormats().one.format(safe(value));
}

export function formatSigned(value: number): string {
  const rounded = Math.round(safe(value));
  if (rounded > 0) return `+${formatInt(rounded)}`;
  if (rounded < 0) return `−${formatInt(Math.abs(rounded))}`;
  return '0';
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, safe(value)));
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, safe(value)));
}

export function formatLocalTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(locale());
}
