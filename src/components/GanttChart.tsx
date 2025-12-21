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
  const addDependency = useTaskStore(state => state.addDependency);

  // Drag & Drop State
  const [dragState, setDragState] = React.useState<{
    taskId: string;
    mode: 'move' | 'resize-left' | 'resize-right' | 'dependency';
    startX: number;
    startY: number; // Added for dependency drag
    initialStartDate: Date;
    initialEndDate: Date;
    currentStartDate: Date;
    currentEndDate: Date;
    targetTaskId?: string; // For dependency drop target
  } | null>(null);

  // Helper to find task element and get coordinates
  const getTaskCoordinates = (taskId: string) => {
    // This is tricky in React without refs for every task.
    // We can rely on data attributes or IDs.
    // Let's assume we add `data-task-id={taskId}` to the task bar.
    const element = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    // We need coordinates relative to the Gantt chart container (lines container)
    // We can use a ref for the container.
    return rect;
  };

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = React.useState<{x: number, y: number} | null>(null);

  React.useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Update mouse pos for dependency line
      if (dragState.mode === 'dependency') {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setMousePos({
                x: e.clientX - rect.left + containerRef.current.scrollLeft, // Adjust for scroll
                y: e.clientY - rect.top + containerRef.current.scrollTop
            });
        }
        return;
      }

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

    const handleMouseUp = (e: MouseEvent) => {
      if (dragState) {
        if (dragState.mode === 'dependency') {
             // Check if we dropped on a task
             // We can use document.elementFromPoint or simpler if we tracked hover.
             // Let's use logic: find task element under mouse.
             // But 'e.target' might be the covering SVG or something.
             // Let's assume we can get target from e.target if pointer-events allow.
             
             // Simplest: Check if the element under cursor has data-task-id
             // We temporarily hide the SVG line or ensure it has pointer-events-none?
             // Yes, SVG line should be pointer-events-none.
             
             let target = e.target as HTMLElement;
             // Traverse up to find data-task-id
             while (target && !target.getAttribute?.('data-task-id')) {
                 target = target.parentElement as HTMLElement;
             }
             
             if (target) {
                 const targetId = target.getAttribute('data-task-id');
                 if (targetId && targetId !== dragState.taskId) {
                     addDependency(dragState.taskId, targetId);
                 }
             }
        } 
        else {
            // Commit changes for move/resize
            const { taskId, currentStartDate, currentEndDate, initialStartDate, initialEndDate } = dragState;
            if (currentStartDate.getTime() !== initialStartDate.getTime() || currentEndDate.getTime() !== initialEndDate.getTime()) {
               const newDuration = Math.ceil((currentEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
               
               updateTask(taskId, {
                 startDate: format(currentStartDate, 'yyyy-MM-dd'),
                 endDate: format(currentEndDate, 'yyyy-MM-dd'),
                 duration: newDuration
               });
            }
        }
      }
      setDragState(null);
      setMousePos(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, updateTask, addDependency]);

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
      <div className="flex-1 relative" ref={containerRef}>
        {/* SVG Layer for Dependencies */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ minHeight: flattenedItems.length * 32 }}>
            <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" fill="#9ca3af" />
                </marker>
            </defs>
            {/* Existing Dependencies */}
            {flattenedItems.map(({ id, task }) => (
                task.dependencies?.map(depId => {
                    const depTask = tasks[depId]; // Predecessor
                    if (!depTask) return null;
                    
                    // We need layout coordinates. 
                    // Store layout in state? Or calculate on the fly?
                    // Calculation requires row index.
                    const startIdx = flattenedItems.findIndex(i => i.id === depId);
                    const endIdx = flattenedItems.findIndex(i => i.id === id);
                    if (startIdx === -1 || endIdx === -1) return null;

                    const depEnd = new Date(depTask.endDate);
                    const myStart = new Date(task.startDate);
                    
                    const timelineStart = range[0];
                    const startX = (Math.ceil((depEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)) + 1) * CELL_WIDTH;
                    const endX = Math.ceil((myStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)) * CELL_WIDTH;
                    
                    const startY = startIdx * 32 + 16;
                    const endY = endIdx * 32 + 16;
                    
                    // Simple path
                    // M startX startY L endX endY ? No, ortho.
                    // Right from start, then down/up, then right to end.
                    const midX = startX + 10;
                    const path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;

                    return (
                        <path 
                            key={`${depId}-${id}`}
                            d={path} 
                            stroke="#9ca3af" 
                            strokeWidth="1.5" 
                            fill="none" 
                            markerEnd="url(#arrowhead)"
                        />
                    );
                })
            ))}
            
            {/* Dragging Line */}
            {dragState?.mode === 'dependency' && mousePos && (
                 (() => {
                    const startIdx = flattenedItems.findIndex(i => i.id === dragState.taskId);
                    if (startIdx === -1) return null;
                    
                    const task = tasks[dragState.taskId];
                    const taskEnd = new Date(task.endDate);
                    const timelineStart = range[0];
                    const startX = (Math.ceil((taskEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)) + 1) * CELL_WIDTH;
                    const startY = startIdx * 32 + 16;
                    
                    return (
                        <line 
                            x1={startX} 
                            y1={startY} 
                            x2={mousePos.x} 
                            y2={mousePos.y} 
                            stroke="#3b82f6" 
                            strokeWidth="2" 
                            strokeDasharray="4"
                        />
                    );
                 })()
            )}
        </svg>

        {flattenedItems.map(({ id, task, depth }) => (
          <div key={id} className="flex border-b border-gray-100 hover:bg-gray-50 h-8 relative z-10 pointer-events-none"> 
            {/* pointer-events-none on row wrapper to let svg clicks pass? No, tasks need events. */}
            {/* Actually, we want task bars to catch events. Wrapper can be whatever. */}
            
            {showSidebar && (
              <div className="w-48 flex-shrink-0 border-r border-gray-300 flex items-center px-2 text-xs truncate sticky left-0 z-10 bg-white pointer-events-auto" style={{ paddingLeft: depth * 12 + 8 }}>
                {task.title || '(Untitled)'}
              </div>
            )}
            {/* Bars Area */}
            <div className="relative flex pointer-events-auto">
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
                 const isDragging = dragState?.taskId === id && dragState?.mode !== 'dependency';
                 const taskStart = isDragging && dragState ? dragState.currentStartDate : new Date(task.startDate);
                 const taskEnd = isDragging && dragState ? dragState.currentEndDate : new Date(task.endDate);
                 
                 const timelineStart = range[0];
                 
                 const diffDays = Math.ceil((taskStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
                 const offset = diffDays * CELL_WIDTH;
                 const daySpan = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                 const width = daySpan * CELL_WIDTH;

                 if (width <= 0) return null;

                 return (
                   <div 
                     data-task-id={id}
                     className={clsx(
                        "absolute top-1.5 h-5 rounded text-[9px] flex items-center shadow-sm group",
                        isDragging ? "bg-blue-600 cursor-grabbing z-30" : "bg-blue-500 hover:bg-blue-400 cursor-pointer"
                     )}
                     style={{ left: offset, width: width - 2 }}
                     title={`${task.title}: ${format(taskStart, 'yyyy-MM-dd')} - ${format(taskEnd, 'yyyy-MM-dd')}`}
                     onMouseDown={(e) => {
                        if (e.button !== 0) return; // Only left click
                        e.stopPropagation();
                        setDragState({
                          taskId: id,
                          mode: 'move',
                          startX: e.clientX,
                          startY: e.clientY,
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
                              startY: e.clientY,
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
                              startY: e.clientY,
                              initialStartDate: new Date(task.startDate),
                              initialEndDate: new Date(task.endDate),
                              currentStartDate: new Date(task.startDate),
                              currentEndDate: new Date(task.endDate),
                            });
                        }}
                     />

                     {/* Dependency Handle (Right side) */}
                     <div 
                        className="absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-crosshair opacity-0 group-hover:opacity-100 hover:scale-125 transition-all z-50 shadow-sm"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setDragState({
                              taskId: id,
                              mode: 'dependency',
                              startX: e.clientX,
                              startY: e.clientY,
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
