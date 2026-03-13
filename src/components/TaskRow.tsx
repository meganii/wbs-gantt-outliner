import React, { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { calculateEndDate, getWorkDaysCount } from '../utils/date';
import { format } from 'date-fns';

interface TaskRowProps {
  taskId: string;
  depth?: number;
  prevId?: string;
  nextId?: string;
  wbsNumber?: string;
  isSelected?: boolean;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskRow: React.FC<TaskRowProps> = ({ taskId, depth = 0, prevId, nextId, wbsNumber, isSelected, onSelectionChange }) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const toggleCollapse = useTaskStore((state) => state.toggleCollapse);
  const updateTask = useTaskStore((state) => state.updateTask);
  const addTask = useTaskStore((state) => state.addTask);
  const indentTask = useTaskStore((state) => state.indentTask);
  const outdentTask = useTaskStore((state) => state.outdentTask);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const setFocusedTaskId = useTaskStore((state) => state.setFocusedTaskId);
  const moveTask = useTaskStore((state) => state.moveTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const setCollapsed = useTaskStore((state) => state.setCollapsed);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  
  const effectiveIds = (selectedTaskIds.length > 0 && selectedTaskIds.includes(taskId)) 
                        ? selectedTaskIds 
                        : [taskId];
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusedTaskId === taskId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [focusedTaskId, taskId]);
  
  // Local state for performant typing and IME support
  const [localTitle, setLocalTitle] = useState(task?.title || '');
  const isComposing = useRef(false);

  // Sync local state if external state changes (e.g. undo/redo, or other user)
  useEffect(() => {
    if (task) {
        setLocalTitle(task.title);
    }
  }, [task?.title]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: taskId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (!task) return null;



  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore key events during IME composition
    if (isComposing.current || e.nativeEvent.isComposing) {
       // ...
       return;
    }
    
    // Row Reordering (Move Task): Shift + Cmd + Arrow Keys
    if (e.shiftKey && e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveTask(effectiveIds, e.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }

    // Collapse/Expand: Option + Arrow Keys
    if (!e.shiftKey && e.altKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setCollapsed(effectiveIds, e.key === 'ArrowUp');
      return;
    }

    // Selection Range Extension with Shift + Arrow Keys (No Cmd)
    if (e.shiftKey && !e.metaKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const targetId = e.key === 'ArrowUp' ? prevId : nextId;
      if (targetId) {
          setFocusedTaskId(targetId);
          if (onSelectionChange) {
              onSelectionChange(targetId, false, true); 
          }
      }
      return;
    }

    if (e.key === 'ArrowUp') {
       // Standard Nav
       if (prevId && !e.metaKey) {
        e.preventDefault();
        setFocusedTaskId(prevId);
        if (onSelectionChange) onSelectionChange(prevId, false, false);
      }
    }
    if (e.key === 'ArrowDown') {
       // Standard Nav
      if (nextId && !e.metaKey) {
        e.preventDefault();
        setFocusedTaskId(nextId);
        if (onSelectionChange) onSelectionChange(nextId, false, false);
      }
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      // Only update if changed; addTask will trigger focus move (and thus blur)
      // but to be safe and atomic, we could have a combined action.
      // For now, let's just make sure we don't double-trigger.
      if (task.title !== localTitle) {
        updateTask(taskId, { title: localTitle });
      }
      addTask(taskId, 'after');
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (task.title !== localTitle) {
         updateTask(taskId, { title: localTitle });
      }
      if (e.shiftKey) {
        outdentTask(effectiveIds);
      } else {
        indentTask(effectiveIds);
      }
    }

    if (e.key === 'Backspace') {
      if (localTitle === '') {
        e.preventDefault();
        // Be careful with multiple selection on Backspace?
        // Usually backspace merge?
        // For OUTLINER: Backspace on empty bullet deletes it and focuses previous.
        if (effectiveIds.length <= 1) {
             const targetPrev = prevId; 
             deleteTask(taskId);
             if (targetPrev) {
               setFocusedTaskId(targetPrev);
             }
        } else {
             // Multi-selection: Backspace usually deletes? Or requires explicit Delete?
             // Let's allow Backspace to delete if all are selected?
             // To be safe, let's require Cmd+Backspace for multi or non-empty.
             // But user asked for "Task Deletion".
             // If localTitle is empty, we delete this one.
        }
      }
    }
    
    // Explicit Delete
    if (e.key === 'Delete' || (e.metaKey && e.key === 'Backspace')) {
       e.preventDefault();
       const idsToDelete = effectiveIds;
       
       // Calculate focus target before deletion (simple heuristic: prev of first, or next of last?)
       // If we delete focused task, we need to move focus.
       // Current assumption: focus is on `taskId`.
       let targetFocus = prevId || nextId; 
       
       deleteTask(idsToDelete);
       
       if (targetFocus && !idsToDelete.includes(targetFocus)) {
          setFocusedTaskId(targetFocus);
       } else {
          // If we deleted everything around us, we might fall back to root or parent?
          // Store doesn't handle this well yet.
       }
    }
  };

  const rowStyle = clsx(
    "flex items-center group h-8 border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200",
    isSelected && "bg-blue-50"
  );
  
  const handleBlur = () => {
    if (task.title !== localTitle) {
      updateTask(taskId, { title: localTitle });
    }
  };


  return (
    <div ref={setNodeRef} style={style} className="flex flex-col select-none">
      <div className={rowStyle}>
        <div 
          className="flex items-center flex-1 min-w-0" 
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {/* Drag Handle */}
          <button 
             className="opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-grab mr-1 text-gray-400 focus:outline-none flex-shrink-0"
             {...attributes} 
             {...listeners}
             onPointerDown={(e) => {
               // Prioritize selection with modifiers over dragging
               if (e.shiftKey || e.metaKey || e.ctrlKey) {
                 e.preventDefault();
                 e.stopPropagation();
                 if (onSelectionChange) {
                   onSelectionChange(taskId, e.metaKey || e.ctrlKey, e.shiftKey);
                 }
                 return;
               }
               // Otherwise, pass to dnd-kit
               listeners?.onPointerDown(e);
             }}
             onClick={(e) => {
               // Click without drag (fallback for simple click if dnd doesn't consume)
               if (!e.shiftKey && !e.metaKey && !e.ctrlKey && onSelectionChange) {
                  onSelectionChange(taskId, false, false);
               }
             }}
          >
            <GripVertical size={14} />
          </button>

          {/* Collapse/Expand */}
          <button 
            onClick={() => toggleCollapse(taskId)}
            className={clsx(
              "p-0.5 rounded hover:bg-gray-100 text-gray-400 mr-1 flex-shrink-0",
              task.children.length === 0 && "invisible"
            )}
          >
            {task.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* WBS Number */}
          <span className="text-xs text-gray-500 font-mono mr-2 min-w-[36px] text-right select-none flex-shrink-0">
            {wbsNumber}
          </span>

          {/* Title Input */}
          <input
            ref={inputRef}
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleBlur}
            onFocus={() => setFocusedTaskId(taskId)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposing.current = true; }}
            onCompositionEnd={() => { isComposing.current = false; }}
            placeholder="New Task"
            className="bg-transparent border-none outline-none text-sm text-gray-800 flex-1 placeholder-gray-400 focus:placeholder-gray-300 truncate"
          />
        </div>

        {/* Dates & Metadata */}
        <div className="flex items-center space-x-2 text-xs text-gray-500 mr-4 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {/* Duration */}
          <input 
            type="number" 
            value={task.duration} 
            onChange={(e) => {
              const newDuration = parseInt(e.target.value) || 0;
              if (!task.startDate) return;
              const newEndDate = calculateEndDate(
                new Date(task.startDate),
                newDuration,
                useTaskStore.getState().projectConfig.calendar
              );
              const newEndDateStr = format(newEndDate, 'yyyy-MM-dd');
              updateTask(taskId, { duration: newDuration, endDate: newEndDateStr });
            }}
            className="bg-transparent w-8 text-right outline-none border-b border-transparent focus:border-gray-300 focus:text-gray-900"
            title="Duration (days)"
          />
          
          {/* Start Date */}
          <input 
            type="date"
            value={task.startDate || ''}
            onChange={(e) => {
               const newStartDate = e.target.value;
               if (!newStartDate) return;
               const newEndDate = calculateEndDate(
                 new Date(newStartDate),
                 task.duration,
                 useTaskStore.getState().projectConfig.calendar
               );
               const newEndDateStr = format(newEndDate, 'yyyy-MM-dd');
               updateTask(taskId, { startDate: newStartDate, endDate: newEndDateStr });
            }}
            className="bg-transparent outline-none w-24 text-center cursor-pointer hover:text-gray-900 text-gray-600 text-[10px]"
          />

          <span className="text-gray-400">-</span>

          {/* End Date */}
          <input 
            type="date"
            value={task.endDate || ''}
            onChange={(e) => {
               const newEndDate = e.target.value;
               if (!newEndDate || !task.startDate) return;
               // Calculate new duration
               const start = new Date(task.startDate);
               const end = new Date(newEndDate);
               if (end < start) return; // Basic validation
               
               const newDuration = getWorkDaysCount(
                 start,
                 end,
                 useTaskStore.getState().projectConfig.calendar
               );
               updateTask(taskId, { endDate: newEndDate, duration: newDuration });
            }}
            className="bg-transparent outline-none w-24 text-center cursor-pointer hover:text-gray-900 text-gray-600 text-[10px]"
          />
        </div>
      </div>

    </div>
  );
};
