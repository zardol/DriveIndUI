import { t } from '../i18n';
import { BarChart3, Box, BrainCircuit, CalendarRange, Database, GitCompareArrows, Layers3 } from 'lucide-react';
import { WORKSPACES, pageHref, type WorkspacePage } from '../navigation';

const ICONS = { overview: BarChart3, factory: Box, plan: CalendarRange, decisions: GitCompareArrows, data: Database, ai: BrainCircuit };
export function Sidebar({ page }: { page: WorkspacePage }) {
  return <aside className='rail'>
    <a className='workspace-brand' href={pageHref('overview')} aria-label={t("DriveIndUI — обзор")}><Layers3 size={24} /><span>DriveIndUI<small>Industrial workspace</small></span></a>
    <span className='rail-caption'>{t("ПРОИЗВОДСТВО / Allur")}</span>
    <nav className='rail__nav' aria-label={t("Основная навигация")}><ul>
      {WORKSPACES.map(item => {
        const Icon = ICONS[item.id];
        return <li key={item.id}><a className='rail__link' href={pageHref(item.id)} aria-current={page === item.id ? 'page' : undefined}>
          <Icon size={19} aria-hidden='true' /><span>{t(item.label)}</span><small aria-hidden='true'>{t(item.number)}</small>
        </a></li>;
      })}
    </ul></nav>
    <div className='rail-footer'><span className='rail-live-dot' />{t("Тестовый кейс")}<small>{t("Октябрь 2026")}</small></div>
  </aside>;
}
