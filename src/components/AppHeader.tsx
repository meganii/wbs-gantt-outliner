import { useRef, useState, useMemo } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';
import {
  CalendarDays,
  ChevronDown,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Flag,
  FolderOpen,
  Redo2,
  RefreshCw,
  RotateCcw,
  Rows3,
  Save,
  Settings,
  SquareGanttChart,
  Table2,
  Trash2,
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
  // ── Settings menu ─────────────────────────────────────────────────────────
  // ヘッダーは overflow-hidden（狭い幅でのはみ出し防止）なので、absolute の
  // ドロップダウンはヘッダーの高さで切り取られてしまう。fixed にして
  // ヘッダーの外へ描画し、ボタンの位置から座標を決める。
  // （z-[60] でメイン領域の行 z-40 / リサイズハンドル z-50 より前面に置く）
  const [settingsMenuPos, setSettingsMenuPos] = useState<{ top: number; right: number } | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  useClickOutside(settingsMenuRef, () => setSettingsMenuPos(null));
  const isSettingsMenuOpen = settingsMenuPos !== null;

  const toggleSettingsMenu = () => {
    if (settingsMenuPos) {
      setSettingsMenuPos(null);
      return;
    }
    const rect = settingsButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSettingsMenuPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  // ── Baseline menu ─────────────────────────────────────────────────────────
  const [baselineMenuPos, setBaselineMenuPos] = useState<{ top: number; right: number } | null>(null);
  const baselineMenuRef = useRef<HTMLDivElement>(null);
  const baselineButtonRef = useRef<HTMLButtonElement>(null);
  useClickOutside(baselineMenuRef, () => setBaselineMenuPos(null));
  const isBaselineMenuOpen = baselineMenuPos !== null;

  const toggleBaselineMenu = () => {
    if (baselineMenuPos) {
      setBaselineMenuPos(null);
      return;
    }
    const rect = baselineButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBaselineMenuPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  // ── Zustand store ─────────────────────────────────────────────────────────
  const projectConfig = useTaskStore((state) => state.projectConfig);
  const setBaseline = useTaskStore((state) => state.setBaseline);
  const restoreBaseline = useTaskStore((state) => state.restoreBaseline);
  const clearBaseline = useTaskStore((state) => state.clearBaseline);
  const setShowBaseline = useTaskStore((state) => state.setShowBaseline);
  const hasBaseline = useTaskStore((state) => Object.values(state.tasks).some(
    (task) => task.baselineStartDate != null || task.baselineEndDate != null
  ));
  const hasPreviousBaseline = useTaskStore((state) => Object.values(state.tasks).some(
    (task) => task.previousBaselineStartDate != null || task.previousBaselineEndDate != null
  ));
  const showBaseline = projectConfig.showBaseline ?? true;
  const baselineSetAt = projectConfig.baselineSetAt ?? null;
  const baselineLabel = baselineSetAt ? `基準計画: ${baselineSetAt.slice(0, 10)} 登録` : '基準計画: 登録済み';

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

      {/* Baseline menu */}
      <div className="relative shrink-0" ref={baselineMenuRef}>
        <button
          ref={baselineButtonRef}
          onClick={toggleBaselineMenu}
          className={clsx(textButton, isBaselineMenuOpen && 'bg-slate-100 text-slate-800')}
          aria-label="基準計画"
          aria-expanded={isBaselineMenuOpen}
          title="基準計画の登録 / 更新 / 表示"
        >
          <Flag
            size={14}
            className={isBaselineMenuOpen || hasBaseline ? 'text-brand-600' : 'text-slate-500'}
          />
          <span className="hidden xl:inline">基準計画</span>
          <ChevronDown size={12} />
        </button>

        {baselineMenuPos && (
          <div
            className="no-drag fixed z-[60] w-64 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-pop"
            style={{ top: baselineMenuPos.top, right: baselineMenuPos.right }}
          >
            <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 border-b border-gray-100 select-none">
              基準計画
            </div>
            {hasBaseline ? (
              <>
                <div className="px-3 py-1.5 text-[11px] text-gray-500 select-none">{baselineLabel}</div>
                <button
                  onClick={() => {
                    setBaseline('update');
                    setBaselineMenuPos(null);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50"
                  title="現在の予定を新しい基準計画として保存します（旧基準は 1 世代前へ退避）"
                >
                  <RefreshCw size={14} className="text-slate-500" />
                  <span className="flex-1">基準計画を更新</span>
                </button>
                <button
                  onClick={() => {
                    restoreBaseline();
                    setBaselineMenuPos(null);
                  }}
                  disabled={!hasPreviousBaseline}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-35 disabled:hover:bg-transparent"
                >
                  <RotateCcw size={14} className="text-slate-500" />
                  <span className="flex-1">基準計画を元に戻す</span>
                </button>
                <button
                  onClick={() => setShowBaseline(!showBaseline)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {showBaseline ? (
                    <EyeOff size={14} className="text-slate-500" />
                  ) : (
                    <Eye size={14} className="text-slate-500" />
                  )}
                  <span className="flex-1">{showBaseline ? '基準計画を非表示' : '基準計画を表示'}</span>
                </button>
                <button
                  onClick={() => {
                    clearBaseline();
                    setBaselineMenuPos(null);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  <span className="flex-1">基準計画を削除</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setBaseline('register');
                  setBaselineMenuPos(null);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50"
                title="現在の予定を基準計画として保存します。通常の日程変更ではこの操作は不要です"
              >
                <Flag size={14} className="text-slate-500" />
                <span className="flex-1">基準計画として登録</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="h-5 w-px bg-line shrink-0" />

      {/* Settings menu */}
      <div className="relative shrink-0" ref={settingsMenuRef}>
        <button
          ref={settingsButtonRef}
          onClick={toggleSettingsMenu}
          className={clsx(
            textButton,
            isSettingsMenuOpen && 'bg-slate-100 text-slate-800'
          )}
          aria-label="設定"
          aria-expanded={isSettingsMenuOpen}
        >
          <Settings
            size={14}
            className={isSettingsMenuOpen ? 'text-brand-600' : 'text-slate-500'}
          />
          <span className="hidden xl:inline">設定</span>
          <ChevronDown size={12} />
        </button>

        {settingsMenuPos && (
          <div
            className="no-drag fixed z-[60] w-60 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-pop"
            style={{ top: settingsMenuPos.top, right: settingsMenuPos.right }}
          >
            <button
              onClick={() => {
                onOpenProjectSettings();
                setSettingsMenuPos(null);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50"
            >
              <CalendarDays size={14} className="text-slate-500" />
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
          <span className="hidden xl:inline">読込</span>
        </button>
        <button onClick={handleExport} className={textButton} title="Excel 出力" aria-label="Excel 出力">
          <FileSpreadsheet size={14} />
          <span className="hidden xl:inline">出力</span>
        </button>
      </div>
    </header>
  );
}
