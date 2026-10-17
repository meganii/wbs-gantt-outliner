import { useState, useCallback, useEffect } from 'react';

interface ColumnWidths {
  taskName: number;
  duration: number;
  date: number;
  [key: string]: number;
}

interface UseOutlinerResizeOptions {
  columnWidths: ColumnWidths;
  /**
   * 左ペインの最小幅。表示中の列の合計幅を渡すことで、
   * 列が隠れて操作できなくなる（横スクロールもできない）状態を防ぐ。
   */
  minWidth?: number;
  initialWidth?: number;
  /** タイムラインに最低限残す幅(px)。 */
  reservedForTimeline?: number;
}

interface UseOutlinerResizeResult {
  outlinerWidth: number;
  startResizing: (e: React.MouseEvent) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Outliner ペインの横幅をマウスドラッグでリサイズする Hook。
 * mousemove / mouseup のグローバルリスナーを管理し、最小・最大幅のクランプを行う。
 */
export function useOutlinerResize({
  columnWidths,
  minWidth,
  initialWidth = 600,
  reservedForTimeline = 320,
}: UseOutlinerResizeOptions): UseOutlinerResizeResult {
  // 表示列が変わると必要幅も変わるため、最小幅は「列の合計」を下限に取る。
  const columnsMinWidth =
    minWidth ?? columnWidths.taskName + columnWidths.duration + columnWidths.date + 16;

  const getMaxWidth = useCallback(
    () => Math.max(columnsMinWidth, window.innerWidth - reservedForTimeline),
    [columnsMinWidth, reservedForTimeline]
  );

  const [outlinerWidth, setOutlinerWidth] = useState(() =>
    clamp(initialWidth, columnsMinWidth, getMaxWidth())
  );
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      setOutlinerWidth(clamp(e.clientX, columnsMinWidth, getMaxWidth()));
    },
    [isResizing, columnsMinWidth, getMaxWidth]
  );

  // 表示列の合計が必要幅を超えたら、隠れないよう自動で広げる（ウィンドウ縮小時は収める）。
  // (effect 内での setState を避け、レンダー中に前回値と比較して state を調整する)
  const [prevMinWidth, setPrevMinWidth] = useState(columnsMinWidth);
  if (prevMinWidth !== columnsMinWidth) {
    setPrevMinWidth(columnsMinWidth);
    setOutlinerWidth((width) => clamp(width, columnsMinWidth, getMaxWidth()));
  }

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return { outlinerWidth, startResizing };
}
