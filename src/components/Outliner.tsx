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

  const flattenedIds = useMemo(() => flattenedItems.map(i => i.id), [flattenedItems]);

  useOutlinerKeyboard();
  const { selectedTaskIds, handleSelectionChange } = useTaskSelection(flattenedIds);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      reorderTask(active.id as string, over?.id as string);
    }
  };

  return (
    <div className="bg-white text-gray-900 overflow-x-auto min-h-full">
      <div className="min-w-full w-min">
        <TaskTableHeader showDetails={showDetails} />
      <div className="pb-4 w-max">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={flattenedIds} strategy={verticalListSortingStrategy}>
            {flattenedItems.map(({ id, depth, wbsNumber }, index) => (
              <TaskRow
                key={id}
                taskId={id}
                depth={depth}
                wbsNumber={wbsNumber}
                prevId={flattenedItems[index - 1]?.id}
                nextId={flattenedItems[index + 1]?.id}
                isSelected={selectedTaskIds.includes(id)}
                isHovered={hoveredTaskId === id}
                onHoverChange={onHoverTaskChange}
                onSelectionChange={handleSelectionChange}
                showDetails={showDetails}
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
