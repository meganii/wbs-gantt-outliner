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
  status?: string;
  isCollapsed: boolean;
  children: string[]; // Ordered list of child IDs
  dependencies: string[]; // Array of Task IDs
  planStartDate?: string | null; // ISO 8601 YYYY-MM-DD (Plan / Baseline)
  planEndDate?: string | null;   // ISO 8601 YYYY-MM-DD (Plan / Baseline)
  planDuration?: number;         // Workdays (Plan / Baseline)
}

export type ColumnId =
  | 'taskName'
  | 'description'
  | 'assignee'
  | 'deliverables'
  | 'status'
  | 'progress'
  | 'planDuration'
  | 'planDate'
  | 'duration'
  | 'date';

export interface WorkCalendar {
  workDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  holidays: string[]; // ISO 8601 YYYY-MM-DD strings
}

export interface ProjectConfig {
  calendar: WorkCalendar;
  viewMode: 'Day' | 'Week' | 'Month' | 'Year';
  columnWidths: {
    taskName: number;
    description: number;
    assignee: number;
    deliverables: number;
    status: number;
    progress: number;
    planDuration: number;
    planDate: number;
    duration: number;
    date: number;
  };
  baselineLocked?: boolean;
  timelineRange?: {
    start: string; // ISO date YYYY-MM-DD
    end: string;   // ISO date YYYY-MM-DD
  };
  /** WBS（詳細テーブル）ビューで表示する列 */
  visibleColumns?: ColumnId[];
  /** 統合表示ビューの左ペインで表示する列（未設定時は既定のコンパクト列） */
  integratedColumns?: ColumnId[];
}

export type TaskFocusableField =
  | 'title'
  | 'description'
  | 'assignee'
  | 'deliverables'
  | 'status'
  | 'progress'
  | 'planDuration'
  | 'planStartDate'
  | 'planEndDate'
  | 'duration'
  | 'startDate'
  | 'endDate';

export interface GanttDragState {
  taskId: string;
  mode: 'move' | 'resize-left' | 'resize-right' | 'dependency' | 'draw-range';
  startX: number;
  startY: number;
  /**
   * draw-range の基準となるタイムライン領域の左端(px)。
   * 起点・終点をどちらも「カーソル下の日セル」で決めるために保持する。
   */
  timelineLeft?: number;
  initialStartDate: Date;
  initialEndDate: Date;
  currentStartDate: Date;
  currentEndDate: Date;
  targetTaskId?: string;
}

export interface TaskStoreState {
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig: ProjectConfig;
  focusedTaskId: string | null;
  focusedTaskField: TaskFocusableField | null;
  selectedTaskIds: string[];
  dragState: GanttDragState | null;
  mousePos: { x: number; y: number } | null;
  /** 「今日へ移動」ボタンの押下ごとに増えるカウンタ（タイムラインのスクロール要求） */
  todayFocusRequestId: number;

  setFocusedTaskId: (id: string | null) => void;
  setFocusedTaskCell: (id: string | null, field: TaskFocusableField | null) => void;
  setSelectedTaskIds: (ids: string[]) => void;
  addTask: (targetId?: string | null, position?: 'after' | 'inside') => void;
  /**
   * 複数行の貼り付けなど、タスクをまとめて追加する。
   * 1 回の set で挿入するため、Undo は 1 エントリ・再描画も 1 回になる。
   * depth は先頭行を 0 とした相対的な階層（深さ上限へクランプされる）。
   * options.referenceTitle を渡すと、参照タスクのタイトルも同じ set 内で更新する。
   */
  addTasks: (
    items: Array<{ title: string; depth: number }>,
    referenceTaskId?: string | null,
    position?: 'after' | 'inside',
    options?: { referenceTitle?: string }
  ) => string[];
  updateTask: (id: string, updates: Partial<Task>) => void;
  endDragUpdate: (id: string, updates: Partial<Task>) => void;
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
  setBaselineLocked: (baselineLocked: boolean) => void;
  setVisibleColumns: (columns: ColumnId[]) => void;
  setIntegratedColumns: (columns: ColumnId[]) => void;
  setDragState: (dragState: GanttDragState | null) => void;
  setMousePos: (mousePos: { x: number; y: number } | null) => void;
  requestScrollToToday: () => void;
}
