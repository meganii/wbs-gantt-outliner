import { useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { TaskRow } from './TaskRow';
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { flattenTree, type FlattenedItem } from '../utils/tree';
import { TaskTableHeader } from './TaskTableHeader';
import { useOutlinerKeyboard } from '../hooks/useOutlinerKeyboard';
import { useTaskSelection } from '../hooks/useTaskSelection';
import { useRowSortSensors } from '../hooks/useRowSortSensors';
import { useStableFlattenedIds } from '../hooks/useStableFlattenedIds';
import type { ColumnId } from '../types';

interface OutlinerProps {
  showDetails?: boolean;
  flattenedItems?: FlattenedItem[];
  hoveredTaskId?: string | null;
  onHoverTaskChange?: (taskId: string | null) => void;
}

export const Outliner = ({
  showDetails = false,
  flattenedItems: flattenedItemsProp,
  hoveredTaskId = null,
  onHoverTaskChange,
}: OutlinerProps) => {
  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);
  const reorderTask = useTaskStore((state) => state.reorderTask);
  const addTask = useTaskStore((state) => state.addTask);

  const flattenedItems = useMemo(() =>
    flattenedItemsProp ?? flattenTree(tasks, rootIds),
    [flattenedItemsProp, tasks, rootIds]
  );

  // SortableContext の items は参照比較で context を配るため、ID 列の内容が同じなら参照を据え置く。
  const flattenedIds = useStableFlattenedIds(flattenedItems);

  const storeVisibleColumns = useTaskStore((state) => state.projectConfig.visibleColumns);
  const setVisibleColumns = useTaskStore((state) => state.setVisibleColumns);

  const visibleColumns = useMemo((): ColumnId[] => {
    if (storeVisibleColumns) {
      return storeVisibleColumns;
    }
    const cols: ColumnId[] = ['taskName'];
    if (showDetails) {
      cols.push('description', 'assignee', 'deliverables', 'status', 'progress');
    }
    cols.push('planDuration', 'planDate', 'duration', 'date');
    return cols;
  }, [storeVisibleColumns, showDetails]);

  useOutlinerKeyboard();
  const { selectedTaskIds, handleSelectionChange } = useTaskSelection(flattenedIds);
  const sensors = useRowSortSensors();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      reorderTask(active.id as string, over?.id as string);
    }
  };

  return (
    // ここで overflow を auto にすると、この div 自身がスクロールコンテナになり
    // （縦横とも auto になる）、TaskTableHeader の `sticky top-0` が実際の
    // 縦スクロール（親の overflow-auto）ではなくこの要素を基準にしてしまい
    // ヘッダーがスクロールアウトする。横スクロールは親に任せる。
    <div className="bg-white text-gray-900 min-h-full">
      <div className="min-w-full w-min">
        <TaskTableHeader
          visibleColumns={visibleColumns}
          menuColumns={storeVisibleColumns ?? visibleColumns}
          onColumnsChange={setVisibleColumns}
        />
      <div className="pb-4 w-max">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={flattenedIds} strategy={verticalListSortingStrategy}>
            {flattenedItems.map(({ id, task, depth, wbsNumber }, index) => (
              <TaskRow
                key={id}
                taskId={id}
                task={task}
                depth={depth}
                wbsNumber={wbsNumber}
                prevId={flattenedItems[index - 1]?.id}
                nextId={flattenedItems[index + 1]?.id}
                isSelected={selectedTaskIds.includes(id)}
                isHovered={hoveredTaskId === id}
                onHoverChange={onHoverTaskChange}
                onSelectionChange={handleSelectionChange}
                visibleColumns={visibleColumns}
              />
            ))}
          </SortableContext>
        </DndContext>
 
        {rootIds.length === 0 && (
          /* ... empty state ... */
          <div
            className="text-gray-500 text-sm mt-4 text-center italic cursor-pointer hover:bg-gray-50 p-4 rounded border border-dashed border-gray-300 transition-colors"
            onClick={() => addTask(null)}
          >
            No tasks. Click here or press Enter to start.
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
