import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Diamond, Plus, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import type { Milestone } from '../types';
import { useTaskStore } from '../store/useTaskStore';
import { formatFullDate } from '../utils/date';

interface MilestoneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 編集対象。null / undefined なら新規追加。 */
  milestone?: Milestone | null;
  /** 新規追加時の初期日付（バンドのダブルクリック位置）。 */
  initialDate?: string;
}

interface FormSeed {
  id: string | null;
  title: string;
  date: string;
  note: string;
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function seedFromProps(
  milestone: Milestone | null | undefined,
  initialDate: string | undefined
): FormSeed {
  if (milestone) {
    return {
      id: milestone.id,
      title: milestone.title,
      date: milestone.date,
      note: milestone.note ?? '',
    };
  }
  return {
    id: null,
    title: '',
    date: initialDate ?? todayIso(),
    note: '',
  };
}

/**
 * マイルストーンの追加・編集・削除ダイアログ。
 * ガントのバンドやサブツールバーから開く。Phase 1 ではタスクの日程は変更しない。
 */
export const MilestoneDialog = ({
  isOpen,
  onClose,
  milestone,
  initialDate,
}: MilestoneDialogProps) => {
  const milestones = useTaskStore((state) => state.milestones);
  const addMilestone = useTaskStore((state) => state.addMilestone);
  const updateMilestone = useTaskStore((state) => state.updateMilestone);
  const deleteMilestone = useTaskStore((state) => state.deleteMilestone);
  const showMilestones = useTaskStore((state) => state.projectConfig.showMilestones ?? true);
  const setShowMilestones = useTaskStore((state) => state.setShowMilestones);

  const initial = seedFromProps(milestone, initialDate);
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [note, setNote] = useState(initial.note);
  const [editingId, setEditingId] = useState<string | null>(initial.id);

  // 開くたび / 別のマイルストーンを選ぶたびにフォームをシードする。
  // （effect 内での setState を避け、レンダー中に state を調整する）
  const seedKey = [
    isOpen ? 'open' : 'closed',
    milestone?.id ?? 'new',
    milestone?.date ?? '',
    milestone?.title ?? '',
    milestone?.note ?? '',
    initialDate ?? '',
  ].join('|');
  const [prevSeedKey, setPrevSeedKey] = useState(seedKey);
  if (prevSeedKey !== seedKey) {
    setPrevSeedKey(seedKey);
    if (isOpen) {
      const next = seedFromProps(milestone, initialDate);
      setTitle(next.title);
      setDate(next.date);
      setNote(next.note);
      setEditingId(next.id);
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

  const resetToNew = () => {
    setTitle('');
    setDate(initialDate ?? todayIso());
    setNote('');
    setEditingId(null);
  };

  const handleSave = () => {
    const trimmedTitle = title.trim() || 'マイルストーン';
    const trimmedNote = note.trim();

    if (editingId) {
      updateMilestone(editingId, {
        title: trimmedTitle,
        date,
        // 空文字は「メモを消す」として渡す（undefined は「変更しない」）。
        note: trimmedNote,
      });
    } else {
      addMilestone({
        title: trimmedTitle,
        date,
        note: trimmedNote || undefined,
      });
    }

    onClose();
  };

  const handleDelete = () => {
    if (!editingId) {
      return;
    }
    deleteMilestone(editingId);
    onClose();
  };

  const handleSelect = (item: Milestone) => {
    setTitle(item.title);
    setDate(item.date);
    setNote(item.note ?? '');
    setEditingId(item.id);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="マイルストーン"
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <Diamond size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">マイルストーン</h2>
              <p className="text-xs text-slate-500">
                スケジュール上のチェックポイントを登録します（タスクの日程は自動で変わりません）。
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="マイルストーンを閉じる"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-900">
                {editingId ? 'マイルストーンを編集' : 'マイルストーンを追加'}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={resetToNew}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-white hover:text-slate-700"
                >
                  <Plus size={12} />
                  新規追加に切り替え
                </button>
              )}
            </div>

            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-500">タイトル</span>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例: 設計凍結"
                  className="h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-500">日付</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-500">メモ（任意）</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={showMilestones}
                  onChange={(event) => setShowMilestones(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                />
                ガント上部に表示
              </label>

              <div className="flex items-center gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <Trash2 size={13} />
                    削除
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!date}
                  className="h-8 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  保存
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-900">登録済み</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                {milestones.length} 件
              </span>
            </div>

            {milestones.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-slate-400">
                まだマイルストーンがありません。上のフォームから追加してください。
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {milestones.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                        editingId === item.id
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-transparent hover:bg-slate-50'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rotate-45 border border-violet-700 bg-violet-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-slate-700">
                          {item.title}
                        </span>
                        {item.note && (
                          <span className="block truncate text-[11px] text-slate-400">{item.note}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                        {formatFullDate(item.date)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
