import type { KeyboardEvent, ReactNode } from 'react';
import { clamp01, clampPercent, formatInt } from '../format';
import { STATUS_META } from '../status';
import type { Incident, PlantSnapshot, StationId, StationSnapshot, StationStatus } from '../types';
import { StatusGlyph } from './StatusGlyph';

const VB_W = 1280;
const VB_H = 254;
const NODE_W = 132;
const NODE_H = 160;
const NODE_Y = 44;
const MARGIN = 20;
const STEP = (VB_W - MARGIN * 2 - NODE_W) / 5;
const GAP = STEP - NODE_W;
const LINE_Y = NODE_Y + NODE_H / 2;
const INNER = NODE_W - 28;
const SLOT = 13;
const SLOT_STEP = 16;
const SLOT_COLS = 4;

const nodeX = (index: number): number => MARGIN + index * STEP;

function splitName(name: string): string[] {
  const index = name.indexOf(' ');
  return index === -1 ? [name] : [name.slice(0, index), name.slice(index + 1)];
}

type ConnectorState = 'flow' | 'full' | 'halt';

function isMoving(station: StationSnapshot | undefined): boolean {
  return station !== undefined && (station.status === 'running' || station.status === 'warning');
}

function connectorState(source: StationSnapshot | undefined, target: StationSnapshot | undefined): ConnectorState {
  if (source?.status === 'stopped' || target?.status === 'stopped') return 'halt';
  if (target && target.inputQueue >= target.bufferCapacity) return 'full';
  return 'flow';
}

function NodeHead({ caption, name }: { caption: string; name: string }) {
  return (
    <>
      <text className='t-caption' x={14} y={25}>
        {caption}
      </text>
      {splitName(name).map((line, index) => (
        <text key={index} className='t-name' x={14} y={47 + index * 17}>
          {line}
        </text>
      ))}
    </>
  );
}

function NodeFrame() {
  return (
    <>
      <rect className='node__focus' x={-5} y={-5} width={NODE_W + 10} height={NODE_H + 10} rx={16} />
      <rect className='node__box' width={NODE_W} height={NODE_H} rx={12} />
      <rect className='node__stripe' x={14} y={0} width={NODE_W - 28} height={3} rx={1.5} />
    </>
  );
}

interface StationNodeProps {
  station: StationSnapshot;
  nodeIndex: number;
  selected: boolean;
  animate: boolean;
  incident: Incident | undefined;
  onSelect: (id: StationId) => void;
}

function StationNode({ station, nodeIndex, selected, animate, incident, onSelect }: StationNodeProps) {
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
      className={`node st--${station.status}${selected ? ' is-selected' : ''}`}
      transform={`translate(${nodeX(nodeIndex)} ${NODE_Y})`}
      role='button'
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onSelect(station.id)}
      onKeyDown={handleKey}
    >
      <title>{meta.hint}</title>
      <NodeFrame />
      <rect
        className={animate && station.status === 'running' ? 'node__pulse is-animated' : 'node__pulse'}
        x={-2}
        y={-2}
        width={NODE_W + 4}
        height={NODE_H + 4}
        rx={14}
      />
      <NodeHead caption={`ЭТАП ${nodeIndex}`} name={station.name} />

      <StatusGlyph status={station.status} size={16} x={12} y={74} />
      <text className='t-status' x={34} y={87}>
        {meta.short}
      </text>

      <text className='t-small' x={14} y={112}>
        Цикл
      </text>
      <text className='t-num' x={NODE_W - 14} y={112} textAnchor='end'>
        {station.inProcess ? `${Math.round(cycle * 100)}%` : '—'}
      </text>
      <rect className='bar-track' x={14} y={118} width={INNER} height={6} rx={3} />
      <rect className='bar-fill' x={14} y={118} width={station.inProcess ? cycle * INNER : 0} height={6} rx={3} />

      <text className='t-small' x={14} y={140}>
        Загрузка
      </text>
      <text className='t-num' x={NODE_W - 14} y={140} textAnchor='end'>
        {Math.round(utilization)}%
      </text>
      <rect className='bar-track' x={14} y={146} width={INNER} height={5} rx={2.5} />
      <rect className='bar-fill bar-fill--util' x={14} y={146} width={(utilization / 100) * INNER} height={5} rx={2.5} />

      {incident && (
        <g className={`node__alert node__alert--${incident.severity}`} transform={`translate(${NODE_W - 8} 6)`}>
          <title>{`Активный инцидент: ${incident.title}`}</title>
          <circle r={11} />
          <text textAnchor='middle' y={4.5}>
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
      className='node node--terminal'
      transform={`translate(${nodeX(0)} ${NODE_Y})`}
      role='group'
      aria-label={`Склад снабжения. Подано на линию ${introducedUnits} единиц. Значение расчётное.`}
    >
      <NodeFrame />
      <NodeHead caption='ИСТОЧНИК' name='Склад снабжения' />
      <text className='t-big' x={14} y={106}>
        {formatInt(introducedUnits)}
      </text>
      <text className='t-small' x={14} y={124}>
        подано на линию
      </text>
      <text className='t-small' x={14} y={146}>
        расчётная величина
      </text>
    </g>
  );
}

function FinishedNode({ goodUnits, shiftPlan, rejectedUnits }: { goodUnits: number; shiftPlan: number; rejectedUnits: number }) {
  return (
    <g
      className='node node--terminal'
      transform={`translate(${nodeX(5)} ${NODE_Y})`}
      role='group'
      aria-label={`Готовые автомобили: ${goodUnits} из ${shiftPlan} по плану, брак ${rejectedUnits}.`}
    >
      <NodeFrame />
      <NodeHead caption='ВЫХОД' name='Готовые автомобили' />
      <text className='t-big' x={14} y={106}>
        {formatInt(goodUnits)}
      </text>
      <text className='t-small' x={14} y={124}>
        {`из ${formatInt(shiftPlan)} по плану`}
      </text>
      <text className='t-small' x={14} y={146}>
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
    const moving = animate && state === 'flow' && (i === 1 || isMoving(source) || isMoving(target));
    const x1 = nodeX(i - 1) + NODE_W + 4;
    const x2 = nodeX(i);

    let queue: ReactNode = null;
    if (target) {
      const capacity = Math.max(1, target.bufferCapacity);
      const rows = Math.ceil(capacity / SLOT_COLS);
      const gridHeight = rows * SLOT_STEP - (SLOT_STEP - SLOT);
      const gridWidth = SLOT_COLS * SLOT_STEP - (SLOT_STEP - SLOT);
      const gridX = x1 - 4 + (GAP - gridWidth) / 2;
      const gridY = LINE_Y - 12 - gridHeight;
      const heavy = target.inputQueue >= capacity * 0.75;
      queue = (
        <g className='queue'>
          <title>{`Очередь перед станцией «${target.name}»: ${target.inputQueue} из ${capacity}`}</title>
          <text className='t-queue' x={gridX + gridWidth / 2} y={gridY - 8} textAnchor='middle'>
            {`Очередь ${target.inputQueue}/${capacity}`}
          </text>
          {Array.from({ length: capacity }, (_, k) => (
            <rect
              key={k}
              className={
                k < target.inputQueue ? `slot slot--filled${heavy ? ' slot--heavy' : ''}` : 'slot'
              }
              x={gridX + (k % SLOT_COLS) * SLOT_STEP}
              y={gridY + Math.floor(k / SLOT_COLS) * SLOT_STEP}
              width={SLOT}
              height={SLOT}
              rx={3}
            />
          ))}
        </g>
      );
    }

    return (
      <g key={i} className={`conn conn--${state}`}>
        <line className='conn__track' x1={x1} y1={LINE_Y} x2={x2 - 11} y2={LINE_Y} />
        {moving && <line className='conn__flow' x1={x1} y1={LINE_Y} x2={x2 - 11} y2={LINE_Y} />}
        <polygon
          className='conn__arrow'
          points={`${x2 - 11},${LINE_Y - 5} ${x2 - 2},${LINE_Y} ${x2 - 11},${LINE_Y + 5}`}
        />
        {queue}
        {i === 5 && (
          <text className='t-queue' x={x1 - 4 + GAP / 2} y={LINE_Y - 10} textAnchor='middle'>
            Годные
          </text>
        )}
      </g>
    );
  });

  return (
    <div className={`flow-scroll${stale ? ' is-stale' : ''}`} role='region' aria-label='Схема линии (прокручиваемая область)' tabIndex={0}>
      <svg
        className='flow'
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role='group'
        aria-label='Схема производственной линии: склад снабжения, сварка, окраска, сборка, контроль качества, готовые автомобили'
      >
        {connectors}
        <SupplyNode introducedUnits={snapshot.introducedUnits} />
        {stations.map((station, index) => (
          <StationNode
            key={station.id}
            station={station}
            nodeIndex={index + 1}
            selected={selected === station.id}
            animate={animate}
            incident={activeIncident(station.id)}
            onSelect={onSelect}
          />
        ))}
        <FinishedNode
          goodUnits={snapshot.goodUnits}
          shiftPlan={snapshot.shiftPlan}
          rejectedUnits={snapshot.rejectedUnits}
        />
        <text className='t-small' x={MARGIN} y={VB_H - 12}>
          {`В потоке: ${formatInt(snapshot.wip)} ед.`}
        </text>
        <text className='t-small' x={VB_W - MARGIN} y={VB_H - 12} textAnchor='end'>
          Схема иллюстративная · данные синтетические
        </text>
      </svg>
      <p className='flow-hint'>Прокрутите схему по горизонтали, чтобы увидеть все этапы.</p>
    </div>
  );
}

export type { StationStatus };
