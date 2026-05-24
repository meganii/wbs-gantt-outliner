import { useState, useCallback, useEffect } from 'react';

interface ColumnWidths {
  taskDescription: number;
  duration: number;
  date: number;
  [key: string]: number;
}

interface UseOutlinerResizeOptions {
  columnWidths: ColumnWidths;
  initialWidth?: number;
}

interface UseOutlinerResizeResult {
  outlinerWidth: number;
  startResizing: (e: React.MouseEvent) => void;
}

/**
 * Outliner ペインの横幅をマウスドラッグでリサイズする Hook。
 * mousemove / mouseup のグローバルリスナーを管理し、
 * 最小・最大幅のクランプを行う。
 */
export function useOutlinerResize({
  columnWidths,
  initialWidth = 600,
}: UseOutlinerResizeOptions): UseOutlinerResizeResult {
  const [outlinerWidth, setOutlinerWidth] = useState(initialWidth);
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
      const minWidth =
        columnWidths.taskDescription + columnWidths.duration + columnWidths.date + 16;
      const maxWidth = Math.max(minWidth, window.innerWidth - 240);
      setOutlinerWidth(Math.min(Math.max(e.clientX, minWidth), maxWidth));
    },
    [isResizing, columnWidths]
  );

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
