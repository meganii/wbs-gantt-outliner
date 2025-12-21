import React, { useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { addDays, format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { flattenTree } from '../utils/tree';
import clsx from 'clsx';
import { isWorkDay } from '../utils/date';

const CELL_WIDTH = 40;
const HEADER_HEIGHT = 40;

interface GanttChartProps {
  showSidebar?: boolean;
}

export const GanttChart: React.FC<GanttChartProps> = ({ showSidebar = false }) => {
  const tasks = useTaskStore(state => state.tasks);
  const rootIds = useTaskStore(state => state.rootIds);
  const holidays = useTaskStore(state => state.projectConfig.calendar.holidays);

  const flattenedItems = useMemo(() => flattenTree(tasks, rootIds), [tasks, rootIds]);

  // Determine timeline range
  // Find min Start and max End from tasks, or default to current month
  // For simplicity, let's show -1 week to +4 weeks from now, or based on task range.
  const range = useMemo(() => {
    const today = new Date();
    // TODO: dynamically calculate from tasks
    const start = startOfWeek(addDays(today, -7), { weekStartsOn: 1 });
    const end = endOfWeek(addDays(today, 28), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, []);

  const updateTask = useTaskStore(state => state.updateTask);

  // Drag & Drop State
  const [dragState, setDragState] = React.useState<{
    taskId: string;
    mode: 'move' | 'resize-left' | 'resize-right';
    startX: number;
    initialStartDate: Date;
    initialEndDate: Date;
    currentStartDate: Date;
    currentEndDate: Date;
  } | null>(null);

  React.useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.startX;
      const deltaDays = Math.round(deltaX / CELL_WIDTH);

      // We only update the visual 'current' dates during drag, not the store
      if (dragState.mode === 'move') {
          const newStart = addDays(dragState.initialStartDate, deltaDays);
          const newEnd = addDays(dragState.initialEndDate, deltaDays);
          setDragState(prev => prev ? { ...prev, currentStartDate: newStart, currentEndDate: newEnd } : null);
      } else if (dragState.mode === 'resize-left') {
          const newStart = addDays(dragState.initialStartDate, deltaDays);
          // Clamp: Start <= End
          if (newStart <= dragState.initialEndDate) {
             setDragState(prev => prev ? { ...prev, currentStartDate: newStart } : null);
          }
      } else if (dragState.mode === 'resize-right') {
          const newEnd = addDays(dragState.initialEndDate, deltaDays);
           // Clamp: End >= Start
          if (newEnd >= dragState.initialStartDate) {
             setDragState(prev => prev ? { ...prev, currentEndDate: newEnd } : null);
          }
      }
    };

    const handleMouseUp = () => {
      // Commit changes
      if (dragState) {
        const { taskId, currentStartDate, currentEndDate, initialStartDate, initialEndDate } = dragState;
        if (currentStartDate.getTime() !== initialStartDate.getTime() || currentEndDate.getTime() !== initialEndDate.getTime()) {
           // Basic duration recalc (naive days difference for now, ignoring holidays logic during drag for simplicity, 
           // but we should probably use getWorkDaysCount logic if we want to be consistent with Outliner.tsx inputs)
           // For now let's just update dates and let store/user handle specifics or update duration based on dates.
           // However, Outliner uses duration to drive end date often. 
           // If we just update Start/End, we should also update duration.
           // Let's calculate duration roughly:
           // TODO: Use helper from utils if possible, keeping simple for now.
           
           const newDuration = Math.ceil((currentEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
           
           updateTask(taskId, {
             startDate: format(currentStartDate, 'yyyy-MM-dd'),
             endDate: format(currentEndDate, 'yyyy-MM-dd'),
             duration: newDuration
           });
        }
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, updateTask]);

  return (
    <div className="flex-1 bg-white text-gray-900 flex flex-col min-h-full select-none">
      {/* Timeline Header */}
      <div className="flex sticky top-0 bg-gray-100 z-10 border-b border-gray-300" style={{ height: HEADER_HEIGHT }}>
        {showSidebar && (
          <div className="w-48 flex-shrink-0 border-r border-gray-300 p-2 font-bold text-xs sticky left-0 z-20 bg-gray-100">Task Name</div>
        )}
        <div className="flex">
          {range.map(date => {
            const isWknd = !isWorkDay(date, holidays);
             return (
              <div 
                key={date.toISOString()} 
                className={clsx(
                  "flex-shrink-0 border-r border-gray-300 text-[10px] flex flex-col items-center justify-center",
                  isWknd ? "bg-gray-200/50 text-gray-400" : "text-gray-600"
                )}
                style={{ width: CELL_WIDTH }}
              >
                <span>{format(date, 'd')}</span>
                <span className="text-[8px]">{format(date, 'EE')}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gantt Rows */}
      <div className="flex-1">
        {flattenedItems.map(({ id, task, depth }) => (
          <div key={id} className="flex border-b border-gray-100 hover:bg-gray-50 h-8">
            {showSidebar && (
              <div className="w-48 flex-shrink-0 border-r border-gray-300 flex items-center px-2 text-xs truncate sticky left-0 z-10 bg-white" style={{ paddingLeft: depth * 12 + 8 }}>
                {task.title || '(Untitled)'}
              </div>
            )}
            {/* Bars Area */}
            <div className="relative flex">
               {/* Grid Background */}
               {range.map(date => {
                 const isWknd = !isWorkDay(date, holidays);
                 return (
                  <div 
                    key={date.toISOString()}
                    className={clsx(
                      "flex-shrink-0 border-r border-gray-100 h-full",
                      isWknd && "bg-gray-100/50"
                    )}
                    style={{ width: CELL_WIDTH }} 
                  />
                 );
               })}

               {/* Task Bar */}
               {(() => {
                 // Determine which dates to use (drag state or real state)
                 const isDragging = dragState?.taskId === id;
                 const taskStart = isDragging ? dragState.currentStartDate : new Date(task.startDate);
                 const taskEnd = isDragging ? dragState.currentEndDate : new Date(task.endDate);
                 
                 const timelineStart = range[0];
                 
                 const diffDays = Math.ceil((taskStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
                 const offset = diffDays * CELL_WIDTH;
                 const daySpan = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                 const width = daySpan * CELL_WIDTH;

                 if (width <= 0) return null;

                 return (
                   <div 
                     className={clsx(
                        "absolute top-1.5 h-5 rounded text-[9px] flex items-center shadow-sm group",
                        isDragging ? "bg-blue-600 cursor-grabbing z-30" : "bg-blue-500 hover:bg-blue-400 cursor-pointer"
                     )}
                     style={{ left: offset, width: width - 2 }}
                     title={`${task.title}: ${format(taskStart, 'yyyy-MM-dd')} - ${format(taskEnd, 'yyyy-MM-dd')}`}
                     onMouseDown={(e) => {
                        if (e.button !== 0) return; // Only left click
                        setDragState({
                          taskId: id,
                          mode: 'move',
                          startX: e.clientX,
                          initialStartDate: new Date(task.startDate),
                          initialEndDate: new Date(task.endDate),
                          currentStartDate: new Date(task.startDate),
                          currentEndDate: new Date(task.endDate),
                        });
                     }}
                   >
                     {/* Left Resize Handle */}
                     <div 
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                             setDragState({
                              taskId: id,
                              mode: 'resize-left',
                              startX: e.clientX,
                              initialStartDate: new Date(task.startDate),
                              initialEndDate: new Date(task.endDate),
                              currentStartDate: new Date(task.startDate),
                              currentEndDate: new Date(task.endDate),
                            });
                        }}
                     />

                     {/* Right Resize Handle */}
                     <div 
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                             setDragState({
                              taskId: id,
                              mode: 'resize-right',
                              startX: e.clientX,
                              initialStartDate: new Date(task.startDate),
                              initialEndDate: new Date(task.endDate),
                              currentStartDate: new Date(task.startDate),
                              currentEndDate: new Date(task.endDate),
                            });
                        }}
                     />
                     
                     <span className="px-1 truncate pointer-events-none text-white">{task.title}</span>
                   </div>
                 );
               })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
