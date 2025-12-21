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

  return (
    <div className="flex-1 overflow-auto bg-white text-gray-900 flex flex-col">
      {/* Timeline Header */}
      <div className="flex sticky top-0 bg-gray-100 z-10 border-b border-gray-300" style={{ height: HEADER_HEIGHT }}>
        {showSidebar && (
          <div className="w-48 flex-shrink-0 border-r border-gray-300 p-2 font-bold text-xs">Task Name</div>
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
              <div className="w-48 flex-shrink-0 border-r border-gray-300 flex items-center px-2 text-xs truncate" style={{ paddingLeft: depth * 12 + 8 }}>
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
                 // Calculate Bar Position
                 const taskStart = new Date(task.startDate);
                 const taskEnd = new Date(task.endDate);
                 
                 // If task is outside range, don't render or clip
                 // Let's find index of start/end in range
                 const timelineStart = range[0];
                 
                 const diffDays = Math.ceil((taskStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
                 // This diff includes weekends.
                 
                 const offset = diffDays * CELL_WIDTH;
                 const daySpan = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                 const width = daySpan * CELL_WIDTH;

                 if (width <= 0) return null;

                 return (
                   <div 
                     className="absolute top-1.5 h-5 bg-blue-500 rounded text-[9px] flex items-center px-1 truncate shadow-sm hover:bg-blue-400 cursor-pointer"
                     style={{ left: offset, width: width - 2 }} // -2 for margin
                     title={`${task.title}: ${task.startDate} - ${task.endDate}`}
                   >
                     {task.title}
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
