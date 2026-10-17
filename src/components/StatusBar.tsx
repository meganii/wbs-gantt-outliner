import { useMemo } from 'react';
import { CalendarDays, ListChecks, MousePointerClick, ZoomIn } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';

type View = 'wbs' | 'integrated' | 'gantt';

const VIEW_LABEL: Record<View, string> = {
  wbs: 'WBS',
  integrated: '統合表示',
  gantt: 'ガントチャート',
};

const VIEW_MODE_LABEL: Record<string, string> = {
  Day: '日',
  Week: '週',
  Month: '月',
  Year: '年',
};

interface StatusBarProps {
  view: View;
}

/**
 * 画面下部のステータスバー。総タスク数・選択数・ズーム・祝日数などの
 * メタ情報を控えめに表示する（旧 "Ready" テキストの置き換え）。
 */
export function StatusBar({ view }: StatusBarProps) {
  const tasks = useTaskStore((state) => state.tasks);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const viewMode = useTaskStore((state) => state.projectConfig.viewMode);
  const holidayCount = useTaskStore((state) => state.projectConfig.calendar.holidays.length);

  const taskCount = useMemo(() => Object.keys(tasks).length, [tasks]);
  const selectionCount = selectedTaskIds.length;

  const item = 'flex items-center gap-1';
  const divider = <span className="h-3.5 w-px bg-line" aria-hidden="true" />;

  return (
    <footer className="h-7 shrink-0 flex items-center gap-3 px-3 bg-white border-t border-line text-[11px] text-slate-500 select-none overflow-hidden">
      <span className={item} title="登録されているタスクの総数">
        <ListChecks size={12} className="text-slate-400" />
        タスク
        <span className="font-medium tabular-nums text-slate-700">{taskCount}</span>
      </span>

      {divider}

      <span className={item} title="現在選択中のタスク数">
        <MousePointerClick size={12} className="text-slate-400" />
        選択
        <span className="font-medium tabular-nums text-slate-700">{selectionCount}</span>
      </span>

      {divider}

      <span className={item} title="タイムラインのズーム">
        <ZoomIn size={12} className="text-slate-400" />
        {VIEW_MODE_LABEL[viewMode] ?? viewMode}
      </span>

      <div className="flex-1" />

      <span className="hidden sm:inline text-slate-400">{VIEW_LABEL[view]}</span>

      <span className={item} title="プロジェクトの祝日数">
        <CalendarDays size={12} className="text-slate-400" />
        祝日
        <span className="font-medium tabular-nums text-slate-700">{holidayCount}</span>
      </span>
    </footer>
  );
}
