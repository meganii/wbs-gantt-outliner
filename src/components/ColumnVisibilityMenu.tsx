import type { ColumnId } from '../types';
import { COLUMN_LABELS, COLUMN_ORDER } from '../utils/columns';

/**
 * 表示項目のトグル一覧。列ヘッダーの右クリックメニューと
 * サブツールバーの「表示項目」ドロップダウンの両方から使う。
 */
export function ColumnVisibilityMenu({
  columns,
  onChange,
  className,
  style,
}: {
  columns: ColumnId[];
  onChange: (columns: ColumnId[]) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const toggle = (columnId: ColumnId) => {
    if (columnId === 'taskName') return;
    if (columns.includes(columnId)) {
      onChange(columns.filter((col) => col !== columnId));
    } else {
      // 列の並び順（COLUMN_ORDER）を保って挿入する
      onChange(COLUMN_ORDER.filter((col) => col === columnId || columns.includes(col)));
    }
  };

  return (
    <div
      className={
        className ??
        'fixed bg-white border border-line rounded-lg shadow-pop py-1 z-[60] text-gray-700 min-w-[180px] font-normal'
      }
      style={style}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 border-b border-gray-100 select-none">
        表示項目の設定
      </div>
      {COLUMN_LABELS.map(({ id, label }) => {
        const isChecked = columns.includes(id);
        const isDisabled = id === 'taskName';

        return (
          <label
            key={id}
            className={`flex items-center px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer select-none ${
              isDisabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={(e) => {
              if (isDisabled) {
                e.preventDefault();
                return;
              }
              toggle(id);
            }}
          >
            <input
              type="checkbox"
              checked={isChecked}
              disabled={isDisabled}
              className="mr-2 h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:cursor-not-allowed"
              onChange={() => {}}
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}
