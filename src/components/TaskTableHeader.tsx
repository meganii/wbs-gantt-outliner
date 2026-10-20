import React, { useState, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';
import { COLUMN_LABEL, CENTERED_COLUMNS, COLUMN_MIN_WIDTHS } from '../utils/columns';
import type { ColumnId } from '../types';

interface TaskTableHeaderProps {
  /** 実際に描画する列（この順で表示する） */
  visibleColumns: ColumnId[];
  /**
   * 表示項目メニューのチェック状態・トグル対象にする列。
   * 省略時は visibleColumns を使う。
   * （例: ベースライン固定中は予定列を描画から外すが、メニューには残したい）
   */
  menuColumns?: ColumnId[];
  /** 列の表示/非表示を変更する。省略時は WBS 用の visibleColumns を更新する。 */
  onColumnsChange?: (columns: ColumnId[]) => void;
  /** ヘッダー行の高さ(px)。統合表示ではタイムラインのヘッダーに合わせる。 */
  height?: number;
}

export const TaskTableHeader = ({
  visibleColumns,
  menuColumns,
  onColumnsChange,
  height = 40,
}: TaskTableHeaderProps) => {
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const setColumnWidth = useTaskStore((state) => state.setColumnWidth);
  const setVisibleColumns = useTaskStore((state) => state.setVisibleColumns);

  const menuSource = menuColumns ?? visibleColumns;
  const changeColumns = onColumnsChange ?? setVisibleColumns;

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const closeMenu = () => setMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const handleResize = (columnId: keyof typeof columnWidths) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[columnId] || 100;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setColumnWidth(columnId, Math.max(COLUMN_MIN_WIDTHS[columnId], startWidth + delta));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const Resizer = ({ columnId }: { columnId: keyof typeof columnWidths }) => (
    <div
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-400 opacity-0 hover:opacity-100 z-20 transition-opacity"
      onMouseDown={handleResize(columnId)}
    />
  );

  return (
    <div
      className="sticky top-0 flex items-center w-max bg-slate-50 border-b border-line text-[11px] font-semibold text-slate-500 z-10 select-none"
      style={{ height }}
      onContextMenu={handleContextMenu}
    >
      {visibleColumns.map((colId) => {
        const isCentered = CENTERED_COLUMNS.includes(colId);

        return (
          <div
            key={colId}
            className={[
              'h-full flex items-center flex-shrink-0 relative group whitespace-nowrap',
              colId === 'taskName' ? 'flex-1 pl-4 pr-2' : 'px-2 border-l border-line',
              isCentered ? 'justify-center' : '',
            ].join(' ')}
            style={{
              width: columnWidths[colId],
              minWidth: columnWidths[colId],
              maxWidth: columnWidths[colId],
            }}
          >
            {COLUMN_LABEL[colId]}
            <Resizer columnId={colId} />
          </div>
        );
      })}

      {menu && (
        <ColumnVisibilityMenu
          columns={menuSource}
          onChange={changeColumns}
          style={{ top: menu.y, left: menu.x }}
        />
      )}
    </div>
  );
};
