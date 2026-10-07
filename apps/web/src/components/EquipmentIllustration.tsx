import { useId } from 'react';
import type { StationId, StationStatus } from '../types';

interface EquipmentIllustrationProps {
  type: StationId | 'supply' | 'finished';
  status?: StationStatus;
  progress?: number;
  animate?: boolean;
  inProcess?: boolean;
}

export function EquipmentIllustration({
  type,
  status = 'idle',
  progress = 0,
  animate = false,
  inProcess = false,
}: EquipmentIllustrationProps) {
  const clipId = useId();
  const isAnimated = animate && (status === 'running' || status === 'warning') && inProcess;
  const cycle = Math.min(1, Math.max(0, progress));
  const carX = inProcess ? Math.round(12 + cycle * 46) : 35;
  const showCar = inProcess;

  return (
    <g className='equip-bay'>
      <defs>
        <clipPath id={clipId} clipPathUnits='userSpaceOnUse'>
          <rect width='138' height='72' rx='6' />
        </clipPath>
      </defs>
      <rect x='0' y='0' width='138' height='72' rx='6' className='equip-bg' />
      <g clipPath={`url(#${clipId})`}>
        <line x1='4' y1='58' x2='134' y2='58' className='equip-rail-base' />
        <line x1='4' y1='58' x2='134' y2='58' className={`equip-rail-rollers${isAnimated ? ' is-moving' : ''}`} />

        {type === 'supply' && (
          <g className='equip-supply'>
            <rect x='10' y='8' width='118' height='48' rx='2' className='equip-rack-frame' />
            <line x1='10' y1='24' x2='128' y2='24' className='equip-rack-shelf' />
            <line x1='10' y1='40' x2='128' y2='40' className='equip-rack-shelf' />
            <line x1='48' y1='8' x2='48' y2='56' className='equip-rack-shelf' />
            <line x1='88' y1='8' x2='88' y2='56' className='equip-rack-shelf' />
            <rect x='14' y='12' width='28' height='9' rx='1.5' fill='#D97706' opacity='0.9' />
            <rect x='52' y='12' width='30' height='9' rx='1.5' fill='#78716C' opacity='0.9' />
            <rect x='92' y='12' width='28' height='9' rx='1.5' fill='#D97706' opacity='0.9' />
            <rect x='14' y='28' width='28' height='9' rx='1.5' fill='#78716C' opacity='0.9' />
            <rect x='52' y='28' width='30' height='9' rx='1.5' fill='#D97706' opacity='0.9' />
            <rect x='92' y='28' width='28' height='9' rx='1.5' fill='#0D9488' opacity='0.9' />
          </g>
        )}

        {type === 'welding' && (
          <g className='equip-welding'>
            <rect x='8' y='44' width='12' height='12' rx='2' fill='#475569' />
            <g transform='translate(14, 44)'>
              <g className={isAnimated ? 'anim-arm-left' : undefined}>
                <path d='M0 0 L6 -16 L20 -8' stroke='#F59E0B' strokeWidth='4' strokeLinecap='round' fill='none' />
                <circle cx='0' cy='0' r='3' fill='#B45309' />
                <circle cx='6' cy='-16' r='2.5' fill='#B45309' />
                {isAnimated && (
                  <g transform='translate(20, -8)'><g className='anim-spark'>
                    <line x1='-3' y1='-3' x2='3' y2='3' stroke='#FDE047' strokeWidth='1.5' />
                    <line x1='-3' y1='3' x2='3' y2='-3' stroke='#FDE047' strokeWidth='1.5' />
                    <circle cx='0' cy='0' r='2' fill='#FEF08A' />
                  </g></g>
                )}
              </g>
            </g>
            {showCar && (
              <g transform={`translate(${carX}, 42)`}>
                <rect x='0' y='8' width='38' height='4' rx='1.5' fill='#78716C' />
                <path d='M6 8 L12 1 H26 L32 8' fill='none' stroke='#78716C' strokeWidth='2' strokeLinecap='round' />
                <circle cx='8' cy='12' r='3' fill='#44403C' />
                <circle cx='30' cy='12' r='3' fill='#44403C' />
              </g>
            )}
            <rect x='118' y='44' width='12' height='12' rx='2' fill='#475569' />
            <g transform='translate(124, 44)'>
              <g className={isAnimated ? 'anim-arm-right' : undefined}>
                <path d='M0 0 L-6 -14 L-16 -6' stroke='#F59E0B' strokeWidth='4' strokeLinecap='round' fill='none' />
                <circle cx='0' cy='0' r='3' fill='#B45309' />
              </g>
            </g>
          </g>
        )}

        {type === 'painting' && (
          <g className='equip-painting'>
            <rect x='6' y='6' width='126' height='8' rx='2' fill='#E2E8F0' stroke='#94A3B8' />
            <line x1='12' y1='14' x2='12' y2='56' stroke='#CBD5E1' strokeWidth='2' />
            <line x1='126' y1='14' x2='126' y2='56' stroke='#CBD5E1' strokeWidth='2' />
            <rect x='36' y='14' width='8' height='6' rx='1' fill='#0284C7' />
            <polygon points='40,20 18,54 62,54' className={`spray-cone${isAnimated ? ' is-active' : ''}`} />
            <rect x='94' y='14' width='8' height='6' rx='1' fill='#0284C7' />
            <polygon points='98,20 76,54 120,54' className={`spray-cone${isAnimated ? ' is-active' : ''}`} />
            {showCar && (
              <g transform={`translate(${carX}, 39)`}>
                <path d='M2 10 Q4 5 10 5 L14 1 Q16 0 20 0 L26 0 Q30 0 32 5 L37 6 Q40 7 40 10 L40 13 L0 13 Z' fill='#38BDF8' stroke='#0284C7' strokeWidth='1' />
                <circle cx='8' cy='13' r='3' fill='#334155' />
                <circle cx='30' cy='13' r='3' fill='#334155' />
              </g>
            )}
          </g>
        )}

        {type === 'assembly' && (
          <g className='equip-assembly'>
            <rect x='6' y='6' width='126' height='6' rx='2' fill='#E2E8F0' stroke='#64748B' />
            <line x1='14' y1='12' x2='14' y2='56' stroke='#94A3B8' strokeWidth='2' />
            <line x1='124' y1='12' x2='124' y2='56' stroke='#94A3B8' strokeWidth='2' />
            <rect x='56' y='8' width='26' height='7' rx='1.5' fill='#F59E0B' />
            <g transform='translate(69, 15)'>
              <g className={isAnimated ? 'anim-hoist' : undefined}>
                <line x1='0' y1='0' x2='0' y2='12' stroke='#475569' strokeWidth='2.5' />
                <path d='M-7 12 H7 M-7 12 V17 M7 12 V17' fill='none' stroke='#F59E0B' strokeWidth='2' />
                <rect x='-5' y='14' width='10' height='7' rx='1' fill='#475569' />
              </g>
            </g>
            {showCar && (
              <g transform={`translate(${carX}, 38)`}>
                <path d='M2 10 Q4 5 10 5 L14 1 Q16 0 20 0 L26 0 Q30 0 32 5 L37 6 Q40 7 40 10 L40 13 L0 13 Z' fill='#2563EB' />
                <path d='M14 2 H19 V5 H12 Z M21 2 H25 L29 5 H21 Z' fill='#BFDBFE' />
                <circle cx='8' cy='13.5' r='3.5' fill='#1E293B' />
                <circle cx='8' cy='13.5' r='1.5' fill='#CBD5E1' />
                <circle cx='30' cy='13.5' r='3.5' fill='#1E293B' />
                <circle cx='30' cy='13.5' r='1.5' fill='#CBD5E1' />
              </g>
            )}
          </g>
        )}

        {type === 'quality' && (
          <g className='equip-quality'>
            <path d='M42 56 V16 Q42 10 48 10 H90 Q96 10 96 16 V56' fill='none' stroke='#0F766E' strokeWidth='3' />
            <circle cx='52' cy='10' r='2' fill='#14B8A6' />
            <circle cx='69' cy='10' r='2' fill='#14B8A6' />
            <circle cx='86' cy='10' r='2' fill='#14B8A6' />
            <g transform='translate(69, 11)'>
              <g className={isAnimated ? 'anim-laser' : undefined}>
                <line x1='0' y1='0' x2='0' y2='45' stroke='#06B6D4' strokeWidth='2' strokeDasharray='3 2' />
              </g>
            </g>
            {showCar && (
              <g transform={`translate(${carX}, 38)`}>
                <path d='M2 10 Q4 5 10 5 L14 1 Q16 0 20 0 L26 0 Q30 0 32 5 L37 6 Q40 7 40 10 L40 13 L0 13 Z' fill='#0D9488' />
                <path d='M14 2 H19 V5 H12 Z M21 2 H25 L29 5 H21 Z' fill='#CCFBF1' />
                <circle cx='8' cy='13.5' r='3.5' fill='#1E293B' />
                <circle cx='8' cy='13.5' r='1.5' fill='#F8FAFC' />
                <circle cx='30' cy='13.5' r='3.5' fill='#1E293B' />
                <circle cx='30' cy='13.5' r='1.5' fill='#F8FAFC' />
                <polygon points='38,8 41,7 41,9' fill='#FEF08A' />
              </g>
            )}
          </g>
        )}

        {type === 'finished' && (
          <g className='equip-finished'>
            <rect x='8' y='10' width='122' height='46' rx='3' fill='#ECFDF5' stroke='#A7F3D0' />
            <polygon points='18,54 120,54 128,58 10,58' fill='#CBD5E1' />
            <g transform='translate(44, 36)'>
              <path d='M2 10 Q4 5 10 5 L14 1 Q16 0 20 0 L27 0 Q31 0 33 5 L39 6 Q43 7 43 10 L43 14 L0 14 Z' fill='#059669' />
              <path d='M14 2 H19 V5 H12 Z M21 2 H26 L30 5 H21 Z' fill='#A7F3D0' />
              <circle cx='9' cy='14' r='3.5' fill='#0F172A' />
              <circle cx='9' cy='14' r='1.5' fill='#F8FAFC' />
              <circle cx='33' cy='14' r='3.5' fill='#0F172A' />
              <circle cx='33' cy='14' r='1.5' fill='#F8FAFC' />
              <polygon points='20,0 21,3 24,4 21,5 20,8 19,5 16,4 19,3' fill='#FDE047' />
            </g>
            <circle cx='116' cy='22' r='7' fill='#10B981' />
            <path d='M113 22 L115 24 L119 20' fill='none' stroke='#FFFFFF' strokeWidth='2' strokeLinecap='round' />
          </g>
        )}
      </g>
    </g>
  );
}
