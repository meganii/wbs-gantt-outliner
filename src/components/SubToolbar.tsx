import { useRef, useState } from 'react';
import clsx from 'clsx';
import { CalendarCheck, ChevronDown, ChevronsDownUp, ChevronsUpDown, Columns3 } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';
import { useClickOutside } from '../hooks/useClickOutside';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';
import { COMPACT_COLUMNS } from '../utils/projectConfig';
import type { ColumnId, ProjectConfig } from '../types';

type View = 'wbs' | 'integrated' | 'gantt';
type ViewMode = ProjectConfig['viewMode'];

interface SubToolbarProps {
  view: View;
}

const ZOOM_LEVELS: { id: ViewMode; label: string; title: string }[] = [
  { id: 'Day', label: '日', title: '日単位' },
  { id: 'Week', label: '週', title: '週単位' },
  { id: 'Month', label: '月', title: '月単位' },
  { id: 'Year', label: '年', title: '年単位' },
];

const barButton =
  'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-600';

/**
 * ビュー共通のサブツールバー。ズーム・今日へ移動・展開/折りたたみ・表示項目をまとめる。
 */
export function SubToolbar({ view }: SubToolbarProps) {
  const projectConfig = useTaskStore((state) => state.projectConfig);
  const setViewMode = useTaskStore((state) => state.setViewMode);
  const requestScrollToToday = useTaskStore((state) => state.requestScrollToToday);
  const setAllCollapsed = useTaskStore((state) => state.setAllCollapsed);
  const setVisibleColumns = useTaskStore((state) => state.setVisibleColumns);
  const setIntegratedColumns = useTaskStore((state) => state.setIntegratedColumns);
  const tasks = useTaskStore((state) => state.tasks);

  const baselineLocked = projectConfig.baselineLocked ?? false;
  const isWbs = view === 'wbs';
  // ズーム・今日への移動はタイムラインを持つビューでのみ意味がある。
  const hasTimeline = !isWbs;

  const menuColumns: ColumnId[] = isWbs
    ? projectConfig.visibleColumns ?? COMPACT_COLUMNS
    : projectConfig.integratedColumns ?? COMPACT_COLUMNS;
  const onColumnsChange = isWbs ? setVisibleColumns : setIntegratedColumns;

  const canExpandAll = Object.values(tasks).some(
    (task) => task.children.length > 0 && task.isCollapsed
  );
  const canCollapseAll = Object.values(tasks).some(
    (task) => task.children.length > 0 && !task.isCollapsed
  );

  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(columnsMenuRef, () => setIsColumnsOpen(false));

  return (
    <div className="h-9 shrink-0 flex items-center gap-1.5 px-2 bg-white border-b border-line select-none">
      {hasTimeline && (
        <>
          {/* Zoom */}
          <span className="pl-1 pr-1 text-[11px] font-medium text-slate-400">ズーム</span>
          <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
            {ZOOM_LEVELS.map(({ id, label, title }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                title={title}
                aria-pressed={projectConfig.viewMode === id}
                className={clsx(
                  'h-7 min-w-[30px] rounded-[5px] px-2 text-xs font-medium transition-colors',
                  projectConfig.viewMode === id
                    ? 'bg-white text-brand-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mx-0.5 h-5 w-px bg-line" />

          <button
            onClick={requestScrollToToday}
            className={barButton}
            title="今日の位置へスクロール"
          >
            <CalendarCheck size={14} />
            今日
          </button>

          <div className="mx-0.5 h-5 w-px bg-line" />
        </>
      )}

      <button
        onClick={() => setAllCollapsed(false)}
        disabled={!canExpandAll}
        className={barButton}
        title="すべて展開 (Cmd/Ctrl+Alt+ArrowDown)"
      >
        <ChevronsDownUp size={14} />
        すべて展開
      </button>
      <button
        onClick={() => setAllCollapsed(true)}
        disabled={!canCollapseAll}
        className={barButton}
        title="すべて折りたたむ (Cmd/Ctrl+Alt+ArrowUp)"
      >
        <ChevronsUpDown size={14} />
        すべて折りたたむ
      </button>

      {view !== 'gantt' && (
        <>
          <div className="mx-0.5 h-5 w-px bg-line" />
          <div className="relative" ref={columnsMenuRef}>
            <button
              onClick={() => setIsColumnsOpen((open) => !open)}
              className={clsx(barButton, isColumnsOpen && 'bg-slate-100 text-slate-800')}
              aria-label="表示項目"
            >
              <Columns3 size={14} />
              表示項目
              <ChevronDown size={12} />
            </button>
            {isColumnsOpen && (
              <ColumnVisibilityMenu
                columns={menuColumns}
                onChange={onColumnsChange}
                baselineLocked={baselineLocked}
                className="absolute left-0 top-full z-[60] mt-1 min-w-[180px] rounded-lg border border-line bg-white py-1 text-gray-700 shadow-pop"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
