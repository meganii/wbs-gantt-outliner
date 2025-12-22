import React, { useMemo, useLayoutEffect, useState, useRef } from 'react';
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

  const [dependencyLines, setDependencyLines] = useState<Array<{ key: string; d: string; fromId: string; toId: string }>>([]);
  const taskBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
  const removeDependency = useTaskStore(state => state.removeDependency);

  // Drag & Drop State
  const [dragState, setDragState] = React.useState<{
    taskId: string;
    mode: 'move' | 'resize-left' | 'resize-right' | 'dependency' | 'draw-range';
    startX: number;
    startY: number; // Added for dependency and draw-range
    initialStartDate: Date;
    initialEndDate: Date;
    currentStartDate: Date;
    currentEndDate: Date;
    targetTaskId?: string; // For dependency drop target
  } | null>(null);

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
      } else if (dragState.mode === 'draw-range') {
          const currentDragDate = addDays(dragState.initialStartDate, deltaDays);
          setDragState(prev => prev ? { ...prev, currentEndDate: currentDragDate } : null);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (dragState) {
        if (dragState.mode === 'dependency') {
             let target = e.target as HTMLElement;
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
        else if (dragState.mode === 'draw-range') {
            const { taskId, currentStartDate, currentEndDate } = dragState;
            const start = currentStartDate < currentEndDate ? currentStartDate : currentEndDate;
            const end = currentStartDate < currentEndDate ? currentEndDate : currentStartDate;
            
            const newDuration = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
             updateTask(taskId, {
                startDate: format(start, 'yyyy-MM-dd'),
                endDate: format(end, 'yyyy-MM-dd'),
                duration: newDuration
             });
        }
        else {
            // Commit changes for move/resize
            const { taskId, currentStartDate, currentEndDate, initialStartDate, initialEndDate } = dragState;
            if (currentStartDate.getTime() !== initialStartDate.getTime() || currentEndDate.getTime() !== initialEndDate.getTime()) {
               const newDuration = Math.round((currentEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
               
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
  }, [dragState, updateTask, addDependency, removeDependency]);

  useLayoutEffect(() => {
    const lines = [];
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    for (const { id, task } of flattenedItems) {
        if (task.dependencies) {
            for (const depId of task.dependencies) {
                const sourceTaskEl = taskBarRefs.current.get(depId);
                const targetTaskEl = taskBarRefs.current.get(id);

                if (sourceTaskEl && targetTaskEl) {
                    const sourceRect = sourceTaskEl.getBoundingClientRect();
                    const targetRect = targetTaskEl.getBoundingClientRect();

                    // Adjust for container's scroll position
                    const scrollLeft = containerRef.current?.scrollLeft || 0;
                    const scrollTop = containerRef.current?.scrollTop || 0;

                    // Calculate positions relative to the container's viewport
                    const startX = sourceRect.right - containerRect.left + scrollLeft;
                    const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top + scrollTop;
                    const endX = targetRect.left - containerRect.left + scrollLeft;
                    const endY = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop;

                    // Smart Routing
                    let path = '';
                    const boxPadding = 20; // Distance to go out before turning
                    // const arrowSpacing = 10; // Space before arrow hits target (Unused)

                    // Check if simple routing works (Target is well to the right of Source)
                    if (endX > startX + boxPadding * 2) {
                        // Simple elbow: Right -> MidX -> Down/Up -> Target
                         const midX = startX + (endX - startX) / 2;
                         path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
                    } else {
                        // Overlap or close routing: Go around
                        
                        // Revised "Around" Path:
                        // 1. Out Right (startX + 10)
                        // 2. Vertical to (endY +/- 12) (The gap line).
                        //    If endY > startY (Target below), y = startY + 16 (Bottom of source row).
                        //    If endY < startY (Target above), y = startY - 16 (Top of source row).
                        const rowHeight = 32;
                        const verticalLaneY = endY > startY ? startY + (rowHeight/2) : startY - (rowHeight/2);
                        
                        // 3. Left to (endX - 10)
                        // 4. Vertical to endY
                        // 5. Right to endX
                        
                        path = `M ${startX} ${startY} 
                                L ${startX + boxPadding} ${startY} 
                                L ${startX + boxPadding} ${verticalLaneY}
                                L ${endX - boxPadding} ${verticalLaneY}
                                L ${endX - boxPadding} ${endY}
                                L ${endX} ${endY}`;
                    }

                    lines.push({ 
                        key: `${depId}::${id}`, 
                        d: path,
                        fromId: depId,
                        toId: id
                    });
                }
            }
        }
    }
    setDependencyLines(lines);
  }, [flattenedItems, tasks, showSidebar]); // Re-run when layout might change

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
        {/* SVG Layer for Dependencies - Z-10 */}
        <svg 
            className="absolute inset-0 w-full h-full pointer-events-none z-10" 
            style={{ minHeight: flattenedItems.length * 32 }}
        >
            <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" fill="currentColor" className="text-gray-400" />
                </marker>
            </defs>
            {/* Existing Dependencies */}
            {dependencyLines.map(({ key, d, fromId, toId }) => {
                return (
                    <path
                        key={key}
                        d={d}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        markerEnd="url(#arrowhead)"
                        className="text-gray-400 hover:text-red-500 hover:stroke-[3] transition-all cursor-pointer pointer-events-auto"
                        style={{ pointerEvents: 'stroke' }}
                        onMouseDown={(e) => {
                            // Prevent starting a draw-range when clicking or dragging from a dependency line
                            e.stopPropagation();
                        } }
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('この依存関係を削除しますか？')) {
                                removeDependency(fromId, toId);
                            }
                        }}
                    />
                );
            })}
            
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
          <div key={id} className="flex border-b border-gray-100 hover:bg-gray-50 h-8 relative z-auto pointer-events-none"> 
            
            {showSidebar && (
              <div className="w-48 flex-shrink-0 border-r border-gray-300 flex items-center px-2 text-xs truncate sticky left-0 z-40 bg-white pointer-events-auto" style={{ paddingLeft: depth * 12 + 8 }}>
                {task.title || '(Untitled)'}
              </div>
            )}
            {/* Bars Area */}
            <div 
                className="relative flex pointer-events-auto cursor-crosshair"
                onMouseDown={(e) => {
                    // Start Drawing Range
                    // Only if clicking on empty space (not propagating from task bar)
                    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('flex-shrink-0')) {
                        // Actually, grid divs are children, so target might be them.
                        // We check if it's NOT a task bar.
                        // Task bar usually stops propagation, so we might be safe.
                        // Let's implement robust check.
                    }
                    if (e.button !== 0) return;
                    
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left; // relative to row
                    // Calculate date from X
                    const daysOffset = Math.floor(x / CELL_WIDTH);
                    const clickedDate = addDays(range[0], daysOffset);
                    
                    setDragState({
                        taskId: id,
                        mode: 'draw-range',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialStartDate: clickedDate,
                        initialEndDate: clickedDate,
                        currentStartDate: clickedDate,
                        currentEndDate: clickedDate
                    });
                }}
            >
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

                {/* Drawing Preview Box */}
               {dragState?.taskId === id && dragState?.mode === 'draw-range' && (
                   (() => {
                        const s = dragState.currentStartDate < dragState.currentEndDate ? dragState.currentStartDate : dragState.currentEndDate;
                        const e = dragState.currentStartDate < dragState.currentEndDate ? dragState.currentEndDate : dragState.currentStartDate;
                        
                        const timelineStart = range[0];
                        const diffDays = Math.round((s.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
                        const offset = diffDays * CELL_WIDTH;
                        const daySpan = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                        const width = daySpan * CELL_WIDTH;
                        
                        return (
                            <div
                                className="absolute top-1.5 h-5 border-2 border-dashed border-blue-500 bg-blue-100/30 z-30 pointer-events-none"
                                style={{ left: offset, width: width - 2 }}
                            />
                        );
                   })()
               )}

               {/* Task Bar - Z-30 */}
               {(() => {
                 // Determine which dates to use (drag state or real state)
                 const isDragging = dragState?.taskId === id && dragState?.mode !== 'dependency' && dragState?.mode !== 'draw-range';
                 const taskStart = isDragging && dragState ? dragState.currentStartDate : new Date(task.startDate);
                 const taskEnd = isDragging && dragState ? dragState.currentEndDate : new Date(task.endDate);
                 
                 const timelineStart = range[0];
                 
                 const diffDays = Math.round((taskStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
                 const offset = diffDays * CELL_WIDTH;
                 const daySpan = Math.round((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                 const width = daySpan * CELL_WIDTH;

                 if (width <= 0) return null;

                 return (
                   <div 
                     ref={el => {
                       if (el) {
                         taskBarRefs.current.set(id, el);
                       } else {
                         taskBarRefs.current.delete(id);
                       }
                     }}
                     data-task-id={id}
                     className={clsx(
                        "absolute top-1.5 h-5 rounded text-[9px] flex items-center shadow-sm group z-30",
                        isDragging ? "bg-blue-600 cursor-grabbing" : "bg-blue-500 hover:bg-blue-400 cursor-pointer"
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
