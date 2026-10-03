import { STATUS_META } from '../status';
import type { StationStatus } from '../types';
import { StatusGlyph } from './StatusGlyph';

export function StatusBadge({ status }: { status: StationStatus }) {
  return (
    <span className={`badge st--${status}`}>
      <StatusGlyph status={status} size={14} />
      {STATUS_META[status].label}
    </span>
  );
}
