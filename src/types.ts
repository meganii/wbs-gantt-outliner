export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  startDate: string; // ISO 8601 YYYY-MM-DD
  endDate: string;   // ISO 8601 YYYY-MM-DD
  duration: number;  // Workdays
  progress: number;  // 0-100
  isCollapsed: boolean;
  children: string[]; // Ordered list of child IDs
  dependencies: string[]; // Array of Task IDs
}

export interface ProjectConfig {
  calendar: {
    workDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    holidays: string[]; // ISO 8601 YYYY-MM-DD strings
  };
  viewMode: 'Day' | 'Week' | 'Month';
}

export interface TaskStoreState {
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig: ProjectConfig;
  
  addTask: (targetId: string, position?: 'after' | 'inside') => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleCollapse: (id: string) => void;
  setCollapsed: (ids: string[], isCollapsed: boolean) => void;
  setProjectConfig: (config: Partial<ProjectConfig>) => void;
}
