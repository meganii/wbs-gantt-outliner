import { useRef, useState, useMemo } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';
import {
  CalendarDays,
  ChevronDown,
  FileSpreadsheet,
  FolderOpen,
  Lock,
  LockOpen,
  Redo2,
  Rows3,
  Save,
  SquareGanttChart,
  Table2,
  Undo2,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useProjectFileHandlers } from '../hooks/useProjectFileHandlers';
import { useTaskStore } from '../store/useTaskStore';

type View = 'wbs' | 'integrated' | 'gantt';

interface AppHeaderProps {
  view: View;
  setView: (view: View) => void;
  onOpenProjectSettings: () => void;
}

const VIEWS: { id: View; label: string; icon: typeof Table2 }[] = [
  { id: 'wbs', label: 'WBS', icon: Table2 },
  { id: 'integrated', label: '統合表示', icon: Rows3 },
  { id: 'gantt', label: 'ガントチャート', icon: SquareGanttChart },
];

export function AppHeader({ view, setView, onOpenProjectSettings }: AppHeaderProps) {
  // ── Project menu ──────────────────────────────────────────────────────────
  // ヘッダーは overflow-hidden（狭い幅でのはみ出し防止）なので、absolute の
  // ドロップダウンはヘッダーの高さで切り取られてしまう。fixed にして
  // ヘッダーの外へ描画し、ボタンの位置から座標を決める。
  // （z-[60] でメイン領域の行 z-40 / リサイズハンドル z-50 より前面に置く）
  const [projectMenuPos, setProjectMenuPos] = useState<{ top: number; right: number } | null>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectButtonRef = useRef<HTMLButtonElement>(null);
  useClickOutside(projectMenuRef, () => setProjectMenuPos(null));
  const isProjectMenuOpen = projectMenuPos !== null;

  const toggleProjectMenu = () => {
    if (projectMenuPos) {
      setProjectMenuPos(null);
      return;
    }
    const rect = projectButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setProjectMenuPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  // ── Zustand store ─────────────────────────────────────────────────────────
  const projectConfig = useTaskStore((state) => state.projectConfig);
  const setBaselineLocked = useTaskStore((state) => state.setBaselineLocked);
  const baselineLocked = projectConfig.baselineLocked ?? false;

  const temporalState = useStore(useTaskStore.temporal, (state) => state);
  const { undo, redo, pastStates, futureStates } = temporalState;
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const holidayCount = useMemo(
    () => projectConfig.calendar.holidays.length,
    [projectConfig.calendar.holidays]
  );

  // ── File handlers ─────────────────────────────────────────────────────────
  const { handleSave, handleLoad, handleExport } = useProjectFileHandlers();

  const iconButton =
    'flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-500 no-drag';
  const textButton =
    'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 no-drag';

  return (
    <header className="h-11 shrink-0 flex items-center gap-1.5 px-2 bg-white border-b border-line select-none draggable overflow-hidden">
      {/* Brand */}
      <div className="flex items-center gap-2 pl-1 pr-2 no-drag shrink-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-white shadow-xs">
          <SquareGanttChart size={14} />
        </div>
        <span className="hidden lg:inline text-[13px] font-semibold tracking-tight text-slate-800">
          WBS Gantt Outliner
        </span>
      </div>

      <div className="h-5 w-px bg-line shrink-0" />

      {/* View switcher */}
      <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 no-drag shrink-0">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={clsx(
              'flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium transition-colors',
              view === id
                ? 'bg-white text-brand-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => undo?.()}
          disabled={!canUndo}
          className={iconButton}
          title="元に戻す (Cmd+Z)"
          aria-label="元に戻す"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={() => redo?.()}
          disabled={!canRedo}
          className={iconButton}
          title="やり直す (Cmd+Y または Cmd+Shift+Z)"
          aria-label="やり直す"
        >
          <Redo2 size={15} />
        </button>
      </div>

      <div className="h-5 w-px bg-line shrink-0" />

      {/* Baseline lock */}
      <label
        className={clsx(
          'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium cursor-pointer transition-colors no-drag shrink-0 border',
          baselineLocked
            ? 'bg-amber-50 border-amber-300 text-amber-700'
            : 'border-transparent text-slate-600 hover:bg-slate-100'
        )}
        title="基準計画（予定）を固定し、実績のみを更新できるようにする"
      >
        <input
          type="checkbox"
          checked={baselineLocked}
          onChange={(e) => setBaselineLocked(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-amber-600 focus:ring-amber-400"
        />
        {baselineLocked ? <Lock size={12} /> : <LockOpen size={12} />}
        基準計画固定
      </label>

      <div className="h-5 w-px bg-line shrink-0" />

      {/* Project menu */}
      <div className="relative shrink-0" ref={projectMenuRef}>
        <button
          ref={projectButtonRef}
          onClick={toggleProjectMenu}
          className={clsx(
            textButton,
            isProjectMenuOpen && 'bg-slate-100 text-slate-800'
          )}
          aria-label="プロジェクト"
          aria-expanded={isProjectMenuOpen}
        >
          <CalendarDays size={14} className="text-brand-500" />
          <span className="hidden xl:inline">プロジェクト</span>
          <ChevronDown size={12} />
        </button>

        {projectMenuPos && (
          <div
            className="no-drag fixed z-[60] w-60 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-pop"
            style={{ top: projectMenuPos.top, right: projectMenuPos.right }}
          >
            <button
              onClick={() => {
                onOpenProjectSettings();
                setProjectMenuPos(null);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50"
            >
              <CalendarDays size={14} className="text-brand-500" />
              <span className="flex-1">祝日設定</span>
              <span className="text-[10px] text-gray-400">{holidayCount}</span>
            </button>
          </div>
        )}
      </div>

      {/* File operations */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={handleSave} className={textButton} title="保存 (JSON)" aria-label="保存">
          <Save size={14} />
          <span className="hidden xl:inline">保存</span>
        </button>
        <button onClick={handleLoad} className={textButton} title="読み込み (JSON)" aria-label="読み込み">
          <FolderOpen size={14} />
          <span className="hidden xl:inline">読み込み</span>
        </button>
        <button onClick={handleExport} className={textButton} title="Excel エクスポート" aria-label="エクスポート">
          <FileSpreadsheet size={14} />
          <span className="hidden xl:inline">エクスポート</span>
        </button>
      </div>
    </header>
  );
}
