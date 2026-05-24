import { useRef, useState, useMemo } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';
import { CalendarDays, ChevronDown, Undo, Redo } from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useProjectFileHandlers } from '../hooks/useProjectFileHandlers';
import { useTaskStore } from '../store/useTaskStore';

type View = 'wbs' | 'integrated' | 'gantt';

interface AppHeaderProps {
  view: View;
  setView: (view: View) => void;
  onOpenProjectSettings: () => void;
}

export function AppHeader({ view, setView, onOpenProjectSettings }: AppHeaderProps) {
  // ── Project menu ──────────────────────────────────────────────────────────
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(projectMenuRef, () => setIsProjectMenuOpen(false));

  // ── Zustand store ─────────────────────────────────────────────────────────
  const projectConfig = useTaskStore((state) => state.projectConfig);
  const setAllCollapsed = useTaskStore((state) => state.setAllCollapsed);
  const setBaselineLocked = useTaskStore((state) => state.setBaselineLocked);
  const baselineLocked = projectConfig.baselineLocked ?? false;

  const tasks = useTaskStore((state) => state.tasks);
  const collapsibleTasks = useMemo(
    () => Object.values(tasks).filter((task) => task.children.length > 0),
    [tasks]
  );
  const canExpandAll = collapsibleTasks.some((task) => task.isCollapsed);
  const canCollapseAll = collapsibleTasks.some((task) => !task.isCollapsed);

  const temporalState = useStore(useTaskStore.temporal, (state) => state);
  const { undo, redo, pastStates, futureStates } = temporalState;
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  // ── File handlers ─────────────────────────────────────────────────────────
  const { handleSave, handleLoad, handleExport } = useProjectFileHandlers();

  return (
    <header className="h-10 bg-gray-100 flex items-center px-4 border-b border-gray-300 select-none draggable">
      <div className="flex space-x-1 no-drag items-center">
        {/* Project Menu */}
        <div className="relative" ref={projectMenuRef}>
          <button
            onClick={() => setIsProjectMenuOpen((open) => !open)}
            className={clsx(
              'flex items-center gap-1 px-3 py-1 text-xs rounded-sm transition-colors no-drag',
              isProjectMenuOpen
                ? 'bg-white text-blue-600 shadow-sm font-medium'
                : 'text-gray-600 hover:bg-gray-200'
            )}
          >
            Project
            <ChevronDown size={12} />
          </button>

          {isProjectMenuOpen && (
            <div className="absolute left-0 top-full mt-1 w-60 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg z-50">
              <button
                onClick={() => {
                  onOpenProjectSettings();
                  setIsProjectMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50"
              >
                <CalendarDays size={14} className="text-blue-500" />
                <span className="flex-1">Holiday Settings</span>
                <span className="text-[10px] text-gray-400">
                  {projectConfig.calendar.holidays.length}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="w-px bg-gray-300 mx-1 h-4 my-auto" />

        {/* View Tabs */}
        <button
          onClick={() => setView('wbs')}
          className={clsx(
            'px-3 py-1 text-xs rounded-sm transition-colors',
            view === 'wbs'
              ? 'bg-white text-blue-600 shadow-sm font-medium'
              : 'text-gray-500 hover:bg-gray-200'
          )}
        >
          WBS
        </button>
        <button
          onClick={() => setView('integrated')}
          className={clsx(
            'px-3 py-1 text-xs rounded-sm transition-colors',
            view === 'integrated'
              ? 'bg-white text-blue-600 shadow-sm font-medium'
              : 'text-gray-500 hover:bg-gray-200'
          )}
        >
          Integrated
        </button>
        <button
          onClick={() => setView('gantt')}
          className={clsx(
            'px-3 py-1 text-xs rounded-sm transition-colors',
            view === 'gantt'
              ? 'bg-white text-blue-600 shadow-sm font-medium'
              : 'text-gray-500 hover:bg-gray-200'
          )}
        >
          Gantt
        </button>

        <div className="w-px bg-gray-300 mx-2 h-4 my-auto" />

        {/* Undo / Redo */}
        <button
          onClick={() => undo?.()}
          disabled={!canUndo}
          className="p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded-sm no-drag"
          title="Undo (Cmd+Z)"
        >
          <Undo size={14} />
        </button>
        <button
          onClick={() => redo?.()}
          disabled={!canRedo}
          className="p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded-sm no-drag"
          title="Redo (Cmd+Y or Cmd+Shift+Z)"
        >
          <Redo size={14} />
        </button>

        <div className="w-px bg-gray-300 mx-2 h-4 my-auto" />

        {/* Expand / Collapse All */}
        <button
          onClick={() => setAllCollapsed(false)}
          disabled={!canExpandAll}
          className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded-sm no-drag"
          title="Expand All (Cmd/Ctrl+Alt+ArrowDown)"
        >
          Expand All
        </button>
        <button
          onClick={() => setAllCollapsed(true)}
          disabled={!canCollapseAll}
          className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded-sm no-drag"
          title="Collapse All (Cmd/Ctrl+Alt+ArrowUp)"
        >
          Collapse All
        </button>

        <div className="w-px bg-gray-300 mx-2 h-4 my-auto" />

        {/* Baseline Lock Toggle */}
        <label className="flex items-center space-x-1 cursor-pointer select-none text-xs text-gray-600 hover:bg-gray-200 px-2 py-1 rounded-sm no-drag">
          <input
            type="checkbox"
            checked={baselineLocked}
            onChange={(e) => setBaselineLocked(e.target.checked)}
            className="cursor-pointer rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 mr-1"
          />
          <span
            className={clsx(
              'font-medium',
              baselineLocked ? 'text-amber-600 font-semibold' : 'text-gray-600'
            )}
          >
            Lock Baseline
          </span>
        </label>

        <div className="w-px bg-gray-300 mx-2 h-4 my-auto" />

        {/* File Operations */}
        <button
          onClick={handleSave}
          className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag"
        >
          Save
        </button>
        <button
          onClick={handleLoad}
          className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag"
        >
          Load
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag"
        >
          Export
        </button>
      </div>
    </header>
  );
}
