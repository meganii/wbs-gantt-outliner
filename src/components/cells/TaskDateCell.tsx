import React, { memo, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import clsx from 'clsx';
import { useTaskStore } from '../../store/useTaskStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import { cellPropsEqual } from './cellPropsEqual';
import { activeColumnClass, useIsActiveColumn } from './cellHighlight';
import { useHoverTooltip } from '../HoverTooltip';
import { formatFullDate, formatToShow, formatToEdit, parseIsoDateStrict } from '../../utils/date';
import { getVisualTaskOrder } from '../../utils/cellPaste';
import { planDatePaste, resolveDateInput, type DateField } from '../../utils/datePaste';
import type { ProjectConfig, Task } from '../../types';

type ColumnWidths = ProjectConfig['columnWidths'];

interface TaskDateCellProps {
  taskId: string;
  task: Task;
  columnWidths: ColumnWidths;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskDateCell = memo(({
  taskId,
  task,
  columnWidths,
  prevId,
  nextId,
  onSelectionChange,
}: TaskDateCellProps) => {
  const startValue = task.startDate || '';
  const endValue = task.endDate || '';
  const isParent = task.children.length > 0;

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const startPickerRef = useRef<HTMLInputElement>(null);
  const endPickerRef = useRef<HTMLInputElement>(null);

  // 初期値はストア値の表示形式で初期化する。空文字で開始すると、透明化した input の
  // placeholder（--/--）が Overlay Span と重なって見える（文字重なりの原因）。
  const [localStart, setLocalStart] = useState(() => formatToShow(startValue));
  const [localEnd, setLocalEnd] = useState(() => formatToShow(endValue));

  const localStartRef = useRef(formatToShow(startValue));
  const localEndRef = useRef(formatToShow(endValue));

  const escapedStartRef = useRef(false);
  const escapedEndRef = useRef(false);

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocusedStart = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'startDate'
  );
  const isFocusedEnd = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'endDate'
  );

  // 複数行選択中は、フォーカス中の列を選択行にまたがる帯として強調する。
  // 日付は 1 セルに開始日 / 終了日が同居するが、コピー & ペーストの対象は
  // フォーカス中のフィールドだけなので、開始日と終了日を独立した列として扱う。
  const isActiveStart = useIsActiveColumn(taskId, 'startDate');
  const isActiveEnd = useIsActiveColumn(taskId, 'endDate');

  const isReadOnly = isParent;

  const buildTooltipContent = (field: DateField) => {
    const label = field === 'startDate' ? '開始日' : '終了日';
    const value = field === 'startDate' ? startValue : endValue;
    return (
      <div className="space-y-0.5">
        <div className="font-medium">
          {label}: {value ? formatFullDate(value) : '未設定'}
        </div>
        <div className="text-slate-300">
          {isReadOnly ? '子タスクから自動計算されます' : 'クリックで入力 / カレンダーから選択'}
        </div>
      </div>
    );
  };

  // ブラウザ標準の title（約 500ms）ではなく、150ms で表示する共通ツールチップ。
  const startTooltip = useHoverTooltip<HTMLDivElement>({
    content: buildTooltipContent('startDate'),
  });
  const endTooltip = useHoverTooltip<HTMLDivElement>({
    content: buildTooltipContent('endDate'),
  });

  // Sync state when focus changes or stored dates change
  // (effect 内での setState を避け、レンダー中に state を調整する)
  const [syncedStart, setSyncedStart] = useState({ focused: isFocusedStart, value: startValue });
  if (syncedStart.focused !== isFocusedStart || syncedStart.value !== startValue) {
    setSyncedStart({ focused: isFocusedStart, value: startValue });
    if (!isFocusedStart) {
      setLocalStart(formatToShow(startValue));
    }
  }

  const [syncedEnd, setSyncedEnd] = useState({ focused: isFocusedEnd, value: endValue });
  if (syncedEnd.focused !== isFocusedEnd || syncedEnd.value !== endValue) {
    setSyncedEnd({ focused: isFocusedEnd, value: endValue });
    if (!isFocusedEnd) {
      setLocalEnd(formatToShow(endValue));
    }
  }

  // commit ハンドラが参照するミラー用 ref を最新化する
  useEffect(() => {
    if (!isFocusedStart) localStartRef.current = formatToShow(startValue);
  }, [isFocusedStart, startValue]);

  useEffect(() => {
    if (!isFocusedEnd) localEndRef.current = formatToShow(endValue);
  }, [isFocusedEnd, endValue]);

  // Focus synchronization
  useEffect(() => {
    if (isFocusedStart && startDateRef.current && startDateRef.current !== document.activeElement) {
      startDateRef.current.focus();
    }
  }, [isFocusedStart]);

  useEffect(() => {
    if (isFocusedEnd && endDateRef.current && endDateRef.current !== document.activeElement) {
      endDateRef.current.focus();
    }
  }, [isFocusedEnd]);

  /** local state とミラー用 ref を同時に更新する。 */
  const setLocalValue = (field: DateField, displayValue: string) => {
    if (field === 'startDate') {
      setLocalStart(displayValue);
      localStartRef.current = displayValue;
    } else {
      setLocalEnd(displayValue);
      localEndRef.current = displayValue;
    }
  };

  /**
   * 入力文字列を確定する。成功したら true、不正値なら false（呼び出し側で表示を戻す）。
   * ストアから最新タスクを読み直すため、連続した更新でも古い値を参照しない。
   */
  const applyDateValue = (field: DateField, rawValue: string): boolean => {
    const latest = useTaskStore.getState().tasks[taskId];
    if (!latest) return false;

    if (rawValue.trim() === '') {
      if ((latest[field] ?? '') !== '') {
        useTaskStore.getState().updateTask(
          taskId,
          field === 'startDate' ? { startDate: '' } : { endDate: '' }
        );
      }
      setLocalValue(field, '');
      return true;
    }

    const parsed = resolveDateInput(rawValue, field, latest);
    if (!parsed) {
      return false;
    }

    if ((latest[field] ?? '') !== parsed) {
      useTaskStore.getState().updateTask(
        taskId,
        field === 'startDate' ? { startDate: parsed } : { endDate: parsed }
      );
    }
    setLocalValue(field, formatToShow(parsed));
    return true;
  };

  const commitStartValue = () => {
    if (isReadOnly) return;
    const { setFocusedTaskCell } = useTaskStore.getState();
    if (escapedStartRef.current) {
      escapedStartRef.current = false;
      setLocalValue('startDate', formatToShow(startValue));
      if (isFocusedStart) setFocusedTaskCell(null, null);
      return;
    }

    if (!applyDateValue('startDate', localStartRef.current)) {
      setLocalValue('startDate', formatToShow(startValue));
    }
    if (isFocusedStart) {
      setFocusedTaskCell(null, null);
    }
  };

  const commitEndValue = () => {
    if (isReadOnly) return;
    const { setFocusedTaskCell } = useTaskStore.getState();
    if (escapedEndRef.current) {
      escapedEndRef.current = false;
      setLocalValue('endDate', formatToShow(endValue));
      if (isFocusedEnd) setFocusedTaskCell(null, null);
      return;
    }

    if (!applyDateValue('endDate', localEndRef.current)) {
      setLocalValue('endDate', formatToShow(endValue));
    }
    if (isFocusedEnd) {
      setFocusedTaskCell(null, null);
    }
  };

  const notifyPasteIssues = (invalidCount: number, skippedCount: number) => {
    if (invalidCount === 0 && skippedCount === 0) return;

    const details: string[] = [];
    if (invalidCount > 0) details.push(`日付として解釈できない値: ${invalidCount} 件`);
    if (skippedCount > 0) details.push(`親タスクのためスキップ: ${skippedCount} 件`);

    useNotificationStore.getState().notify({
      level: 'warning',
      message: '一部の日付を貼り付けできませんでした',
      details,
    });
  };

  /**
   * 貼り付け。単一セルは即時確定し、複数行 / 複数選択はまとめて更新する。
   * 解釈できない単一値は既定の貼り付けに任せる（blur 時に元へ戻る）。
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, field: DateField) => {
    if (isReadOnly) return;

    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const { selectedTaskIds, tasks } = useTaskStore.getState();
    const plan = planDatePaste({
      taskId,
      field,
      text,
      selectedTaskIds,
      visualOrder: getVisualTaskOrder(),
      tasks,
    });

    if (!plan) {
      return;
    }

    e.preventDefault();

    if (plan.isSingle) {
      applyDateValue(field, plan.targets[0].value);
      return;
    }

    if (plan.targets.length === 0) {
      useNotificationStore.getState().notify({
        level: 'warning',
        message: '貼り付けた値を日付として解釈できませんでした',
      });
      return;
    }

    useTaskStore.getState().setTaskDateValues(
      plan.targets.map((target) => target.id),
      field,
      plan.targets.map((target) => target.value)
    );

    // フォーカス中のセルは local state がストア同期の対象外なので明示的に更新する。
    if (plan.focusedValue) {
      setLocalValue(field, formatToShow(plan.focusedValue));
    }
    notifyPasteIssues(plan.invalidCount, plan.skippedCount);
  };

  const openPicker = (field: DateField) => {
    if (isReadOnly) return;

    const picker = field === 'startDate' ? startPickerRef.current : endPickerRef.current;
    if (!picker) return;

    // クリックで input の blur → commit が走るため、最新値をストアから読む。
    const latest = useTaskStore.getState().tasks[taskId];
    const current = latest?.[field] ?? '';
    const other = field === 'startDate' ? latest?.endDate : latest?.startDate;
    const initial = current || other || format(new Date(), 'yyyy-MM-dd');

    picker.value = initial;
    if (field === 'endDate') {
      picker.min = latest?.startDate ?? '';
    }

    try {
      if (typeof picker.showPicker === 'function') {
        picker.showPicker();
      } else {
        picker.click();
      }
    } catch {
      // ブラウザが showPicker を拒否した場合は input にフォーカスするだけに留める。
      picker.click();
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>, field: DateField) => {
    const raw = e.target.value;
    if (raw === '') {
      applyDateValue(field, '');
      e.target.blur();
      return;
    }
    const iso = parseIsoDateStrict(raw);
    if (!iso) return;
    applyDateValue(field, iso);
    // 非表示の date input にフォーカスが残ると、次のキー入力が画面外の
    // セグメント編集になってしまうため、選択後は明示的にフォーカスを外す。
    e.target.blur();
  };

  const { handleArrowNavigation: handleStartKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'startDate',
    prevId,
    nextId,
    commitFieldLocalState: commitStartValue,
    onSelectionChange,
  });

  const { handleArrowNavigation: handleEndKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'endDate',
    prevId,
    nextId,
    commitFieldLocalState: commitEndValue,
    onSelectionChange,
  });

  const handleStartKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      escapedStartRef.current = true;
      e.stopPropagation();
      e.currentTarget.blur();
      return;
    }
    if (handleStartKeyDown(e, false)) return;
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.currentTarget.blur();
    }
  };

  const handleEndKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      escapedEndRef.current = true;
      e.stopPropagation();
      e.currentTarget.blur();
      return;
    }
    if (handleEndKeyDown(e, false)) return;
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.currentTarget.blur();
    }
  };

  const width = columnWidths.date;

  const renderField = (field: DateField) => {
    const isStart = field === 'startDate';
    const isFocused = isStart ? isFocusedStart : isFocusedEnd;
    const isActiveField = isStart ? isActiveStart : isActiveEnd;
    const tooltip = isStart ? startTooltip : endTooltip;
    const value = isStart ? startValue : endValue;
    const localValue = isStart ? localStart : localEnd;
    const inputRef = isStart ? startDateRef : endDateRef;
    const pickerRef = isStart ? startPickerRef : endPickerRef;
    const setLocal = isStart ? setLocalStart : setLocalEnd;
    const localRef = isStart ? localStartRef : localEndRef;
    const commit = isStart ? commitStartValue : commitEndValue;
    const handleKey = isStart ? handleStartKey : handleEndKey;
    const label = isStart ? '開始日' : '終了日';

    return (
      <div
        ref={tooltip.anchorRef}
        {...tooltip.triggerProps}
        data-date-field-wrapper={field}
        className={clsx(
          'relative flex min-w-0 items-center gap-0.5 rounded-sm',
          isActiveField && activeColumnClass
        )}
      >
        <div className="relative h-full min-w-0 flex-1">
          {!isFocused && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center select-none text-[10px] font-medium text-gray-600">
              {formatToShow(value) || (isReadOnly ? '' : '--/--')}
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={localValue}
            placeholder={isFocused ? 'MM/DD' : ''}
            readOnly={isReadOnly}
            tabIndex={isReadOnly ? -1 : undefined}
            onFocus={() => {
              if (isReadOnly) return;
              const editVal = formatToEdit(value);
              setLocal(editVal);
              localRef.current = editVal;
              useTaskStore.getState().setFocusedTaskCell(taskId, field);
            }}
            onChange={(e) => {
              if (isReadOnly) return;
              setLocal(e.target.value);
              localRef.current = e.target.value;
            }}
            onBlur={commit}
            onKeyDown={handleKey}
            onPaste={(e) => handlePaste(e, field)}
            data-task-id={taskId}
            data-field={field}
            aria-label={`${label}${value ? ` ${formatFullDate(value)}` : ' 未設定'}`}
            className={clsx(
              'w-full min-w-0 cursor-pointer bg-transparent text-center text-[10px] text-gray-700 outline-none',
              isReadOnly
                ? 'cursor-not-allowed select-none font-semibold text-gray-400'
                : 'text-gray-600 hover:text-gray-900',
              !isFocused && 'text-transparent caret-transparent'
            )}
          />
        </div>

        {isReadOnly ? (
          // 親タスクはカレンダーボタンを出さないが、同じ幅の余白を確保して
          // 葉タスクと日付テキストの中心位置を揃える。
          <span aria-hidden="true" className="h-[15px] w-[15px] shrink-0" />
        ) : (
          <button
            type="button"
            onClick={() => openPicker(field)}
            aria-label={`${label}のカレンダーを開く`}
            className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            <CalendarDays size={11} />
          </button>
        )}

        {!isReadOnly && (
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            data-date-picker={field}
            data-task-id={taskId}
            min={field === 'endDate' ? startValue || undefined : undefined}
            onChange={(e) => handlePickerChange(e, field)}
            className="pointer-events-none absolute right-0 bottom-0 h-8 w-8 opacity-0"
          />
        )}
        {tooltip.tooltip}
      </div>
    );
  };

  return (
    <div
      data-date-cell={taskId}
      className={clsx(
        'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1 overflow-hidden border-l border-gray-100 px-1 text-xs text-gray-500 opacity-50 transition-opacity group-hover:opacity-100',
        (isActiveStart || isActiveEnd) && '!opacity-100'
      )}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {renderField('startDate')}
      <span className="text-gray-400">-</span>
      {renderField('endDate')}
    </div>
  );
}, cellPropsEqual);

TaskDateCell.displayName = 'TaskDateCell';
