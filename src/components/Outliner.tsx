import React, { useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { TaskRow } from './TaskRow';
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { flattenTree } from '../utils/tree';

export const Outliner: React.FC = () => {
  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);
  const reorderTask = useTaskStore((state) => state.reorderTask); // Need to implement this in store

  const flattenedItems = useMemo(() => 
    flattenTree(tasks, rootIds), 
    [tasks, rootIds]
  );
  
  const flattenedIds = useMemo(() => flattenedItems.map(i => i.id), [flattenedItems]);
  
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const setSelectedTaskIds = useTaskStore((state) => state.setSelectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  
  const [anchorId, setAnchorId] = React.useState<string | null>(null);

  const addTask = useTaskStore((state) => state.addTask);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.isComposing || e.keyCode === 229) {
          return;
        }
        setSelectedTaskIds([]);
      }

      // Create first task when empty and Enter is pressed
      if (rootIds.length === 0 && e.key === 'Enter') {
        e.preventDefault();
        addTask(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rootIds.length, addTask, setSelectedTaskIds]);

  // Selection Logic
  const handleSelectionChange = (id: string, multi: boolean, range: boolean) => {
    if (range) {
       // Range select from anchor (or focused) to id
       const targetAnchor = anchorId || focusedTaskId || (selectedTaskIds.length > 0 ? selectedTaskIds[selectedTaskIds.length-1] : id);
       
       const startIdx = flattenedIds.indexOf(targetAnchor);
       const endIdx = flattenedIds.indexOf(id);
       
       if (startIdx !== -1 && endIdx !== -1) {
         const min = Math.min(startIdx, endIdx);
         const max = Math.max(startIdx, endIdx);
         const rangeIds = flattenedIds.slice(min, max + 1);
         setSelectedTaskIds(rangeIds);
         // Don't update anchor on range extend? Usually anchor stays same.
         return;
       }
    }
    
    // Non-range selection updates the anchor
    setAnchorId(id);
    
    if (multi) {
      // Toggle
      if (selectedTaskIds.includes(id)) {
        setSelectedTaskIds(selectedTaskIds.filter(sid => sid !== id));
      } else {
        setSelectedTaskIds([...selectedTaskIds, id]);
      }
    } else {
      setSelectedTaskIds([id]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
       // Implementation of reorderTask (simple swap vs tree move)
       // For tree, it's specific. We probably need `reorderTask` to handle "move active to after over".
       // For now, let's just log or call a store action.
       reorderTask(active.id as string, over?.id as string);
    }
  };

  return (
    <div className="bg-white text-gray-900 overflow-x-auto">
      <div className="h-[40px] sticky top-0 bg-gray-100 border-b border-gray-300 flex items-center px-4 font-bold text-xs z-10 w-full">
        Task Description
      </div>
      <div className="px-4 pb-4">
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
                onSelectionChange={handleSelectionChange}
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
  );
};
