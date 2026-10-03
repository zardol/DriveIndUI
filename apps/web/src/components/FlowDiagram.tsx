import type { KeyboardEvent, ReactNode } from 'react';
import { clamp01, clampPercent, formatInt } from '../format';
import { STATUS_META } from '../status';
import type { Incident, PlantSnapshot, StationId, StationSnapshot, StationStatus } from '../types';
import { EquipmentIllustration } from './EquipmentIllustration';
import { StatusGlyph } from './StatusGlyph';
import '../stage2-flow.css';

const VB_W = 1280;
const VB_H = 254;
const NODE_W = 154;
const NODE_H = 210;
const NODE_Y = 16;
const GAP = 58;
const MARGIN = 33;
const LINE_Y = NODE_Y + 76;

const nodeX = (index: number): number => MARGIN + index * (NODE_W + GAP);

type ConnectorState = 'flow' | 'full' | 'halt';

function isMoving(station: StationSnapshot | undefined): boolean {
  return station !== undefined && (station.status === 'running' || station.status === 'warning');
}

function connectorState(source: StationSnapshot | undefined, target: StationSnapshot | undefined): ConnectorState {
  if (source?.status === 'stopped' || target?.status === 'stopped') return 'halt';
  if (target && target.inputQueue >= target.bufferCapacity) return 'full';
  return 'flow';
}

interface StationNodeProps {
  station: StationSnapshot;
  nodeIndex: number;
  selected: boolean;
  animate: boolean;
  stale: boolean;
  incident: Incident | undefined;
  onSelect: (id: StationId) => void;
}

function StationNode({ station, nodeIndex, selected, animate, stale, incident, onSelect }: StationNodeProps) {
  const meta = STATUS_META[station.status];
  const cycle = clamp01(station.progress);
  const utilization = clampPercent(station.utilizationPercent);
  const label =
    `${station.name}. Статус: ${meta.label}. Очередь ${station.inputQueue} из ${station.bufferCapacity}. ` +
    `Загрузка ${Math.round(utilization)} процентов.` +
    (incident ? ' Есть активный инцидент.' : '');

  const handleKey = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(station.id);
    }
  };

  return (
    <g
      className={`flow-node st--${station.status}${selected ? ' is-selected' : ''}`}
      transform={`translate(${nodeX(nodeIndex)} ${NODE_Y})`}
      role='button'
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onSelect(station.id)}
      onKeyDown={handleKey}
    >
      <title>{meta.hint}</title>
      <rect className='flow-focus' x={-4} y={-4} width={NODE_W + 8} height={NODE_H + 8} rx={14} />
      <rect className='flow-panel' width={NODE_W} height={NODE_H} rx={10} />
      <rect className='flow-top-stripe' x={10} y={0} width={NODE_W - 20} height={3} rx={1.5} />

      <text className='flow-caption' x={10} y={18}>
        {`ЭТАП ${nodeIndex}`}
      </text>
      <text className='flow-name' x={10} y={34}>
        {station.name}
      </text>

      <g className='flow-badge-wrap' transform='translate(10 186)'>
        <g>
          <rect className='flow-badge' width={NODE_W - 20} height={18} rx={9} />
          <StatusGlyph status={station.status} size={14} x={4} y={3} />
          <text className='flow-badge-text' x={22} y={14}>
            {meta.label}
          </text>
        </g>
      </g>

      <g transform='translate(8 42)'>
        <EquipmentIllustration
          type={station.id}
          status={station.status}
          progress={cycle}
          animate={animate && !stale}
          inProcess={station.inProcess}
        />
      </g>

      <text className='flow-metric-lbl' x={10} y={135}>
        Цикл
      </text>
      <text className='flow-metric-val' x={NODE_W - 10} y={135} textAnchor='end'>
        {station.inProcess ? `${Math.round(cycle * 100)}%` : '—'}
      </text>
      <rect className='flow-bar-bg' x={10} y={141} width={NODE_W - 20} height={6} rx={3} />
      <rect
        className='flow-bar-fill'
        x={10}
        y={141}
        width={station.inProcess ? cycle * (NODE_W - 20) : 0}
        height={6}
        rx={3}
      />

      <text className='flow-metric-lbl' x={10} y={166}>
        Загрузка
      </text>
      <text className='flow-metric-val' x={NODE_W - 10} y={166} textAnchor='end'>
        {`${Math.round(utilization)}%`}
      </text>
      <rect className='flow-bar-bg' x={10} y={172} width={NODE_W - 20} height={6} rx={3} />
      <rect
        className='flow-bar-fill flow-bar-fill--util'
        x={10}
        y={172}
        width={(utilization / 100) * (NODE_W - 20)}
        height={6}
        rx={3}
      />

      {incident && (
        <g
          className={`flow-alert flow-alert--${incident.severity}${animate && !stale ? ' is-pulsing' : ''}`}
          transform={`translate(${NODE_W - 8} 8)`}
        >
          <title>{`Активный инцидент: ${incident.title}`}</title>
          <circle r={9} />
          <text textAnchor='middle' y={3.5}>
            !
          </text>
        </g>
      )}
    </g>
  );
}

function SupplyNode({ introducedUnits }: { introducedUnits: number }) {
  return (
    <g
      className='flow-node node--terminal'
      transform={`translate(${nodeX(0)} ${NODE_Y})`}
      role='group'
      aria-label={`Склад снабжения. Подано на линию ${introducedUnits} единиц. Значение расчётное.`}
    >
      <rect className='flow-panel' width={NODE_W} height={NODE_H} rx={10} />
      <rect className='flow-top-stripe flow-top-stripe--term' x={10} y={0} width={NODE_W - 20} height={3} rx={1.5} />
      <text className='flow-caption' x={10} y={18}>
        ИСТОЧНИК
      </text>
      <text className='flow-name' x={10} y={34}>
        Склад снабжения
      </text>
      <g transform='translate(8 42)'>
        <EquipmentIllustration type='supply' />
      </g>
      <text className='flow-term-num' x={10} y={146}>
        {formatInt(introducedUnits)}
      </text>
      <text className='flow-term-sub' x={10} y={164}>
        подано на линию
      </text>
      <text className='flow-term-note' x={10} y={180}>
        расчётная величина
      </text>
    </g>
  );
}

function FinishedNode({
  goodUnits,
  shiftPlan,
  rejectedUnits,
}: {
  goodUnits: number;
  shiftPlan: number;
  rejectedUnits: number;
}) {
  return (
    <g
      className='flow-node node--terminal'
      transform={`translate(${nodeX(5)} ${NODE_Y})`}
      role='group'
      aria-label={`Готовые автомобили: ${goodUnits} из ${shiftPlan} по плану, брак ${rejectedUnits}.`}
    >
      <rect className='flow-panel' width={NODE_W} height={NODE_H} rx={10} />
      <rect className='flow-top-stripe flow-top-stripe--term' x={10} y={0} width={NODE_W - 20} height={3} rx={1.5} />
      <text className='flow-caption' x={10} y={18}>
        ВЫХОД
      </text>
      <text className='flow-name' x={10} y={34}>
        Готовые автомобили
      </text>
      <g transform='translate(8 42)'>
        <EquipmentIllustration type='finished' />
      </g>
      <text className='flow-term-num' x={10} y={146}>
        {formatInt(goodUnits)}
      </text>
      <text className='flow-term-sub' x={10} y={164}>
        {`из ${formatInt(shiftPlan)} по плану`}
      </text>
      <text className='flow-term-note' x={10} y={180}>
        {`брак: ${formatInt(rejectedUnits)}`}
      </text>
    </g>
  );
}

interface FlowDiagramProps {
  snapshot: PlantSnapshot;
  selected: StationId;
  animate: boolean;
  stale: boolean;
  onSelect: (id: StationId) => void;
}

export function FlowDiagram({ snapshot, selected, animate, stale, onSelect }: FlowDiagramProps) {
  const { stations, incidents } = snapshot;

  const activeIncident = (stationId: StationId): Incident | undefined => {
    const open = incidents.filter((item) => item.stationId === stationId && item.resolvedAtSeconds === null);
    return open.find((item) => item.severity === 'critical') ?? open[0];
  };

  const connectors: ReactNode[] = [1, 2, 3, 4, 5].map((i) => {
    const source = i >= 2 ? stations[i - 2] : undefined;
    const target = i <= 4 ? stations[i - 1] : undefined;
    const state = connectorState(source, target);
    const moving = animate && !stale && state === 'flow' && (i === 1 || isMoving(source) || isMoving(target));
    const x1 = nodeX(i - 1) + NODE_W;
    const x2 = nodeX(i);

    let queueNode: ReactNode = null;
    if (target) {
      const capacity = Math.max(1, target.bufferCapacity);
      const qBoxW = 50;
      const qBoxH = 46;
      const qX = x1 + (GAP - qBoxW) / 2;
      const qY = LINE_Y - qBoxH - 8;
      const heavy = target.inputQueue >= capacity * 0.75;
      const slotCols = 4;
      const slotSize = 8;
      const slotStep = 10;
      const gridW = slotCols * slotStep - (slotStep - slotSize);
      const gridStartX = qX + (qBoxW - gridW) / 2;

      queueNode = (
        <g className='flow-queue'>
          <title>{`Очередь перед станцией «${target.name}»: ${target.inputQueue} из ${capacity}`}</title>
          <rect className='flow-queue-box' x={qX} y={qY} width={qBoxW} height={qBoxH} rx={4} />
          <text className='flow-queue-title' x={qX + qBoxW / 2} y={qY + 12} textAnchor='middle'>
            {`Очередь ${target.inputQueue}/${capacity}`}
          </text>
          {Array.from({ length: capacity }, (_, k) => (
            <rect
              key={k}
              className={`flow-queue-slot${k < target.inputQueue ? (heavy ? ' is-heavy' : ' is-filled') : ''}`}
              x={gridStartX + (k % slotCols) * slotStep}
              y={qY + 18 + Math.floor(k / slotCols) * slotStep}
              width={slotSize}
              height={slotSize}
              rx={2}
            />
          ))}
        </g>
      );
    }

    return (
      <g key={i} className={`flow-conn conn--${state}`}>
        <line className='flow-conn-base' x1={x1} y1={LINE_Y} x2={x2 - 10} y2={LINE_Y} />
        <line
          className={`flow-conn-line${moving ? ' is-flowing' : ''}`}
          x1={x1}
          y1={LINE_Y}
          x2={x2 - 10}
          y2={LINE_Y}
        />
        <polygon
          className='flow-conn-arrow'
          points={`${x2 - 10},${LINE_Y - 4} ${x2 - 2},${LINE_Y} ${x2 - 10},${LINE_Y + 4}`}
        />
        {queueNode}
        {i === 5 && (
          <text className='flow-queue-title' x={x1 + GAP / 2} y={LINE_Y - 12} textAnchor='middle'>
            Годные
          </text>
        )}
      </g>
    );
  });

  return (
    <div
      className={`flow-container flow-scroll${stale ? ' is-stale' : ''}`}
      role='region'
      aria-label='Схема линии (прокручиваемая область)'
      tabIndex={0}
    >
      <svg
        className='flow-svg'
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role='group'
        aria-label='Схема производственной линии: склад снабжения, сварка, окраска, сборка, контроль качества, готовые автомобили'
      >
        <line x1={0} y1={LINE_Y} x2={VB_W} y2={LINE_Y} className='flow-floor-line' />
        {connectors}
        <SupplyNode introducedUnits={snapshot.introducedUnits} />
        {stations.map((station, index) => (
          <StationNode
            key={station.id}
            station={station}
            nodeIndex={index + 1}
            selected={selected === station.id}
            animate={animate}
            stale={stale}
            incident={activeIncident(station.id)}
            onSelect={onSelect}
          />
        ))}
        <FinishedNode
          goodUnits={snapshot.goodUnits}
          shiftPlan={snapshot.shiftPlan}
          rejectedUnits={snapshot.rejectedUnits}
        />
        <text className='flow-footnote' x={MARGIN} y={VB_H - 12}>
          {`В потоке: ${formatInt(snapshot.wip)} ед.`}
        </text>
        <text className='flow-footnote' x={VB_W - MARGIN} y={VB_H - 12} textAnchor='end'>
          Схема иллюстративная · данные синтетические
        </text>
      </svg>
      <p className='flow-hint'>Прокрутите схему по горизонтали, чтобы увидеть все этапы.</p>
    </div>
  );
}

export type { StationStatus };
