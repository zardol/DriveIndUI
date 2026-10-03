import type { ConveyorVehicleSnapshot } from '@kosta/shared';

interface Track { from: number; to: number }

/** Interpolate only between received states; never predict production or pass a leader. */
export class ConveyorMotion {
  private tracks = new Map<string, Track>();
  private epoch = '';
  private elapsed = -1;
  private receivedAt = 0;
  private duration = 0;
  private moving = false;

  ingest(vehicles: ConveyorVehicleSnapshot[], epoch: string, elapsed: number, now: number, animate: boolean, spacing: number): void {
    if (epoch === this.epoch && elapsed === this.elapsed && animate === this.moving) return;
    const reset = epoch !== this.epoch || elapsed < this.elapsed || this.elapsed < 0;
    const ordered = [...vehicles].sort((a, b) => b.distance - a.distance || a.serial - b.serial);
    const starts = ordered.map(vehicle => reset || !animate ? vehicle.distance : Math.min(vehicle.distance, this.distance(vehicle.id, now) ?? vehicle.distance));
    // A newly admitted unit may already occupy the tail's old display position.
    // Move predecessors forward within their authoritative bounds, never hide a unit.
    for (let i = starts.length - 2; i >= 0; i--) starts[i] = Math.min(ordered[i].distance, Math.max(starts[i], starts[i + 1] + spacing));
    this.duration = reset || !animate ? 0 : Math.min(350, Math.max(50, now - this.receivedAt));
    this.tracks = new Map(ordered.map((vehicle, i) => [vehicle.id, { from: starts[i], to: vehicle.distance }]));
    this.epoch = epoch;
    this.elapsed = elapsed;
    this.receivedAt = now;
    this.moving = animate;
  }

  distance(id: string, now: number): number | undefined {
    const track = this.tracks.get(id);
    if (!track) return undefined;
    const t = this.duration > 0 ? Math.max(0, Math.min(1, (now - this.receivedAt) / this.duration)) : 1;
    return track.from + (track.to - track.from) * t;
  }
}
