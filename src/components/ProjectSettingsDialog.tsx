import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Plus, Trash2, X } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';

interface ProjectSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectSettingsDialog = ({ isOpen, onClose }: ProjectSettingsDialogProps) => {
  const holidays = useTaskStore((state) => state.projectConfig.calendar.holidays);
  const setCalendarHolidays = useTaskStore((state) => state.setCalendarHolidays);
  const [draftHoliday, setDraftHoliday] = useState('');

  const holidayItems = useMemo(
    () => holidays.map((holiday) => ({
      value: holiday,
      label: format(parseISO(holiday), 'yyyy-MM-dd (EEE)'),
    })),
    [holidays]
  );

  // ダイアログを開いたタイミングで入力をリセットする
  // (effect 内での setState を避け、レンダー中に state を調整する)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setDraftHoliday('');
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleAddHoliday = () => {
    if (!draftHoliday) {
      return;
    }

    setCalendarHolidays([...holidays, draftHoliday]);
    setDraftHoliday('');
  };

  const handleRemoveHoliday = (holiday: string) => {
    setCalendarHolidays(holidays.filter((value) => value !== holiday));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CalendarDays size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">プロジェクト設定</h2>
              <p className="text-xs text-slate-500">
                プロジェクトの稼働カレンダーで、休業日（祝日）を登録します。
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="プロジェクト設定を閉じる"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-slate-900">祝日</h3>
                <p className="mt-1 text-xs text-slate-500">
                  登録した日付はカレンダーおよび以降の日程計算で休業日として扱われます。
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                {holidays.length} 件登録済み
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="date"
                value={draftHoliday}
                onChange={(event) => setDraftHoliday(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddHoliday();
                  }
                }}
                className="h-10 flex-1 rounded-md border border-line bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={handleAddHoliday}
                disabled={!draftHoliday}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Plus size={16} />
                祝日を追加
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-medium text-slate-900">登録済みの日付</h3>
              <span className="text-xs text-slate-400">プロジェクト JSON に保存されます</span>
            </div>

            {holidayItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                登録された祝日はまだありません。
              </div>
            ) : (
              <div className="max-h-72 overflow-auto thin-scrollbar">
                {holidayItems.map((holiday) => (
                  <div
                    key={holiday.value}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-800">{holiday.value}</div>
                      <div className="text-xs text-slate-500">{holiday.label}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveHoliday(holiday.value)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
