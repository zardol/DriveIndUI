import type { StationStatus } from '../types';

interface StatusGlyphProps {
  status: StationStatus;
  size?: number;
  x?: number;
  y?: number;
  className?: string;
}

/**
 * Пиктограмма статуса: форма отличается у каждого статуса,
 * поэтому статус читается не только по цвету.
 */
export function StatusGlyph({ status, size = 16, x, y, className }: StatusGlyphProps) {
  let shape;
  switch (status) {
    case 'running':
      shape = (
        <>
          <circle cx='8' cy='8' r='6.5' />
          <path className='glyph__fill' d='M6.4 5.1 11 8l-4.6 2.9z' />
        </>
      );
      break;
    case 'idle':
      shape = (
        <>
          <circle cx='8' cy='8' r='6.5' strokeDasharray='2.2 2.2' />
          <path d='M8 4.6V8l2.3 1.5' />
        </>
      );
      break;
    case 'blocked':
      shape = (
        <>
          <rect x='1.8' y='1.8' width='12.4' height='12.4' rx='2.4' />
          <path d='M4.8 8h6.4' />
        </>
      );
      break;
    case 'stopped':
      shape = (
        <>
          <path d='M5.2 1.6h5.6l3.6 3.6v5.6l-3.6 3.6H5.2l-3.6-3.6V5.2z' />
          <path d='M6 6l4 4M10 6l-4 4' />
        </>
      );
      break;
    default:
      shape = (
        <>
          <path d='M8 2 14.6 13.6H1.4z' />
          <path d='M8 6.4v3.2M8 11.6v.1' />
        </>
      );
  }

  return (
    <svg
      className={`glyph${className ? ` ${className}` : ''}`}
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox='0 0 16 16'
      aria-hidden='true'
      focusable='false'
    >
      {shape}
    </svg>
  );
}
