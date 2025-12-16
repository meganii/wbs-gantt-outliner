import React, { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TaskRowProps {
  taskId: string;
  depth?: number;
}

export const TaskRow: React.FC<TaskRowProps> = ({ taskId, depth = 0 }) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const toggleCollapse = useTaskStore((state) => state.toggleCollapse);
  const updateTask = useTaskStore((state) => state.updateTask);
  const addTask = useTaskStore((state) => state.addTask);
  const indentTask = useTaskStore((state) => state.indentTask);
  const outdentTask = useTaskStore((state) => state.outdentTask);
  
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
    paddingLeft: `${depth * 20 + 8}px`
  };

  if (!task) return null;

  const handleBlur = () => {
    if (task.title !== localTitle) {
      updateTask(taskId, { title: localTitle });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore key events during IME composition
    if (isComposing.current || e.nativeEvent.isComposing) {
      if (e.key === 'Enter') {
         // Should usually allow default behavior to confirm composition? 
         // But usually browser handles confirm before keydown?
         return; 
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      // Ensure title is saved before adding new task
      if (task.title !== localTitle) {
        updateTask(taskId, { title: localTitle });
      }
      addTask(taskId, 'after');
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      // Save title before structural change
      if (task.title !== localTitle) {
         updateTask(taskId, { title: localTitle });
      }
      if (e.shiftKey) {
        outdentTask(taskId);
      } else {
        indentTask(taskId);
      }
    }
    // TODO: Backspace to delete if empty
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col select-none">
      <div 
        className={clsx(
          "flex items-center group py-1 border-b border-gray-800 hover:bg-white/5",
          "transition-colors duration-200"
        )}
      >
        {/* Drag Handle */}
        <button 
          className="opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-grab mr-1 text-gray-400 focus:outline-none"
          {...attributes} 
          {...listeners}
        >
          <GripVertical size={14} />
        </button>

        {/* Collapse/Expand */}
        <button 
          onClick={() => toggleCollapse(taskId)}
          className={clsx(
            "p-0.5 rounded hover:bg-white/10 text-gray-400 mr-2",
            task.children.length === 0 && "invisible"
          )}
        >
          {task.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Title Input */}
        <input
          type="text"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; }}
          placeholder="New Task"
          className="bg-transparent border-none outline-none text-sm text-gray-200 flex-1 placeholder-gray-600 focus:placeholder-gray-700"
        />

        {/* Dates & Metadata (Visible on hover or always?) -> Always for now, maybe condensed */}
        <div className="flex items-center space-x-2 text-xs text-gray-500 mr-4 opacity-50 group-hover:opacity-100 transition-opacity">
          <input 
            type="number" 
            value={task.duration} 
            onChange={(e) => updateTask(taskId, { duration: parseInt(e.target.value) || 0 })}
            className="bg-transparent w-12 text-right outline-none border-b border-transparent focus:border-gray-600 focus:text-gray-300"
            title="Duration (days)"
          />
          <span className="text-gray-600">days</span>
          
          <input 
            type="date"
            value={task.startDate}
            onChange={(e) => updateTask(taskId, { startDate: e.target.value })}
            className="bg-transparent outline-none w-24 text-center cursor-pointer hover:text-gray-300"
          />
        </div>
      </div>

      {/* Children */}
      {!task.isCollapsed && task.children.length > 0 && (
        <div>
          {task.children.map((childId) => (
            <TaskRow key={childId} taskId={childId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};
