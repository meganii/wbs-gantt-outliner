export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  description?: string;
  assignee?: string;
  deliverables?: string;
  startDate: string | null; // ISO 8601 YYYY-MM-DD
  endDate: string | null;   // ISO 8601 YYYY-MM-DD
  duration: number;  // Workdays
  progress: number;  // 0-100
  isCollapsed: boolean;
  children: string[]; // Ordered list of child IDs
  dependencies: string[]; // Array of Task IDs
}

export interface WorkCalendar {
  workDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  holidays: string[]; // ISO 8601 YYYY-MM-DD strings
}

export interface ProjectConfig {
  calendar: WorkCalendar;
  viewMode: 'Day' | 'Week' | 'Month' | 'Year';
  columnWidths: {
    taskDescription: number;
    description: number;
    assignee: number;
    deliverables: number;
    duration: number;
    date: number;
  };
}

export type TaskFocusableField =
  | 'title'
  | 'description'
  | 'assignee'
  | 'deliverables'
  | 'duration'
  | 'startDate'
  | 'endDate';

export interface TaskStoreState {
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig: ProjectConfig;
  focusedTaskId: string | null;
  focusedTaskField: TaskFocusableField;
  selectedTaskIds: string[];

  setFocusedTaskId: (id: string | null) => void;
  setFocusedTaskCell: (id: string | null, field: TaskFocusableField) => void;
  setSelectedTaskIds: (ids: string[]) => void;
  addTask: (targetId?: string | null, position?: 'after' | 'inside') => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (ids: string | string[]) => void;
  toggleCollapse: (id: string) => void;
  setCollapsed: (ids: string[], isCollapsed: boolean) => void;
  setAllCollapsed: (isCollapsed: boolean) => void;
  indentTask: (ids: string | string[]) => void;
  outdentTask: (ids: string | string[]) => void;
  reorderTask: (activeId: string, overId: string) => void;
  moveTask: (ids: string | string[], direction: 'up' | 'down') => void;
  addDependency: (fromId: string, toId: string) => void;
  removeDependency: (fromId: string, toId: string) => void;
  setCalendarHolidays: (holidays: string[]) => void;
  setViewMode: (viewMode: ProjectConfig['viewMode']) => void;
  setColumnWidth: (columnId: keyof ProjectConfig['columnWidths'], width: number) => void;
}
