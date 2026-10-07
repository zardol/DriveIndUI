import { t } from '../i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';

/** A portal keeps the timer's help above the chart/3D canvas and inside the viewport. */
export function ScenarioInfo({ name, description }: { name: string; description: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => { setOpen(false); button.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const height = panel.current?.offsetHeight ?? 240;
      setPosition({ left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        top: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - height - 12)) });
    };
    place(); closeButton.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !button.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    };
  }, [open, name, description]);
  return <>
    <button ref={button} type='button' className='icon-btn session-info-button' aria-label={t("Информация о смене")} title={t("Информация о смене")}
      aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup='dialog' onClick={() => setOpen(value => !value)}><Info size={18} /></button>
    {open && createPortal(<div ref={panel} id={id} role='dialog' aria-modal='false' aria-labelledby={id + '-title'} className='session-info-popover' style={position}>
      <div className='session-info-heading'><strong id={id + '-title'}>{t("Информация о смене")}</strong><button ref={closeButton} className='icon-btn' type='button' aria-label={t("Закрыть информацию")} onClick={close}><X size={16} /></button></div>
      <strong>{t(name)}</strong><p>{t(description)}</p><p>{t("Смена сценария и сброс обнуляют выпуск и время. План и скорость сохраняются.")}</p>
    </div>, document.body)}
  </>;
}
