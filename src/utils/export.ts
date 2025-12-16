import * as XLSX from 'xlsx';
import type { Task } from '../types';
import { flattenTree } from './tree';

export function exportToExcel(tasks: Record<string, Task>, rootIds: string[]) {
  const flattened = flattenTree(tasks, rootIds);
  
  const data = flattened.map(({ task, depth }) => {
    // Generate indentation string
    const indent = ' '.repeat(depth * 4);
    
    return {
      'WBS': indent + task.title,
      'Start Date': task.startDate,
      'End Date': task.endDate,
      'Duration': task.duration,
      'Progress': task.progress + '%',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'WBS');

  // Trigger download (in Electron this might need to use FS or standard browser download)
  // Standard browser download works in Electron renderer usually.
  XLSX.writeFile(wb, 'project_wbs.xlsx');
}
