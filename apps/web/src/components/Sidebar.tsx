import { Activity, Bell, Database, Factory, Info, LayoutDashboard, Workflow, GitCompareArrows } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SectionLink {
  id: string;
  label: string;
  title: string;
  Icon: LucideIcon;
}

const SECTIONS: readonly SectionLink[] = [
  { id: 'overview', label: 'Обзор', title: 'Обзор и управление', Icon: LayoutDashboard },
  { id: 'data', label: 'Данные', title: 'Данные и режим работы', Icon: Database },
  { id: 'flow', label: 'Линия', title: 'Схема линии', Icon: Workflow },
  { id: 'production', label: 'План', title: 'Расчёт выпуска и план', Icon: Activity },
  { id: 'incidents', label: 'События', title: 'Хронология инцидентов', Icon: Bell },
  { id: 'decisions', label: 'Решения', title: 'Сравнение решений', Icon: GitCompareArrows },
  { id: 'legend', label: 'Легенда', title: 'Легенда и пояснения', Icon: Info },
];

function useActiveSection(enabled: boolean, historyMode: boolean): string {
  const [active, setActive] = useState<string>('overview');

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return undefined;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = SECTIONS.find((section) => visible.get(section.id) === true);
        if (first) setActive(first.id);
      },
      { rootMargin: '-72px 0px -55% 0px' },
    );
    for (const section of SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [enabled, historyMode]);

  return active;
}

export function Sidebar({ ready, historyMode }: { ready: boolean; historyMode: boolean }) {
  const active = useActiveSection(ready, historyMode);

  return (
    <aside className='rail'>
      <div className='rail__mark' aria-hidden='true'>
        <Factory size={22} />
      </div>
      <nav className='rail__nav' aria-label='Разделы панели'>
        <ul>
          {SECTIONS.filter(section => !historyMode || section.id === 'overview' || section.id === 'data').map(({ id, label, title, Icon }) => (
            <li key={id}>
              <a
                className='rail__link'
                href={`#${id}`}
                title={title}
                aria-current={ready && active === id ? 'location' : undefined}
              >
                <Icon size={20} aria-hidden='true' />
                <span>{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
