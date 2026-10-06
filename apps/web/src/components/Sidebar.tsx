import { BarChart3, Box, CalendarRange, Database, GitCompareArrows, Layers3 } from 'lucide-react';
import { WORKSPACES, pageHref, type WorkspacePage } from '../navigation';

const ICONS = { overview: BarChart3, factory: Box, plan: CalendarRange, decisions: GitCompareArrows, data: Database };
export function Sidebar({ page }: { page: WorkspacePage }) {
  return <aside className='rail'>
    <a className='workspace-brand' href={pageHref('overview')} aria-label='DriveIndUI — обзор'><Layers3 size={24} /><span>DriveIndUI<small>Industrial workspace</small></span></a>
    <span className='rail-caption'>ПРОИЗВОДСТВО / Allur</span>
    <nav className='rail__nav' aria-label='Основная навигация'><ul>
      {WORKSPACES.map(item => {
        const Icon = ICONS[item.id];
        return <li key={item.id}><a className='rail__link' href={pageHref(item.id)} aria-current={page === item.id ? 'page' : undefined}>
          <Icon size={19} aria-hidden='true' /><span>{item.label}</span><small aria-hidden='true'>{item.number}</small>
        </a></li>;
      })}
    </ul></nav>
    <div className='rail-footer'><span className='rail-live-dot' />Тестовый кейс<small>Октябрь 2026</small></div>
  </aside>;
}
