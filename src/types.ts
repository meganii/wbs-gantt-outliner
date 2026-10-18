export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  description?: string;
  assignee?: string;
  deliverables?: string;
  /** 実績開始日 ISO 8601 YYYY-MM-DD（未着工は null） */
  startDate: string | null;
  /** 実績終了日 ISO 8601 YYYY-MM-DD（完了までは null） */
  endDate: string | null;
  /** 実績期間（Workdays）。実績開始日〜（実績終了日 or 進捗基準日）。 */
  duration: number;
  progress: number;  // 0-100
  status?: string;
  isCollapsed: boolean;
  children: string[]; // Ordered list of child IDs
  dependencies: string[]; // Array of Task IDs
  /** 予定開始日（現在の見込み）。編集可・依存伝播の対象。 ISO 8601 YYYY-MM-DD */
  planStartDate?: string | null;
  /** 予定終了日（現在の見込み）。 */
  planEndDate?: string | null;
  /** 予定期間（Workdays）。 */
  planDuration?: number;
  /** 残り期間（Workdays）。実績期間 + 残り期間 = 予定期間。 */
  remainingDuration?: number;
  /** 基準計画（登録時のスナップショット）。通常運用では不変。 */
  baselineStartDate?: string | null;
  baselineEndDate?: string | null;
  baselineDuration?: number | null;
  /** 1 世代前の基準計画（「基準計画を更新」の退避先）。 */
  previousBaselineStartDate?: string | null;
  previousBaselineEndDate?: string | null;
  previousBaselineDuration?: number | null;
}

/** 複数行ペースト / 一括入力の対象になるテキスト列。 */
export type PasteTextField = 'title' | 'description' | 'assignee' | 'deliverables';

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
  /** 「基準計画として登録」した日時（ISO 8601）。未登録は null。 */
  baselineSetAt?: string | null;
  /** ガントで基準計画バーを表示するか（既定 true）。 */
  showBaseline?: boolean;
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
  /**
   * 複数のタスクの同一フィールドへ、まとめて値をセットする。
   * values が 1 要素なら全行に同一値、複数要素なら ids の順に対応させる
   * （対応する値が無い行は変更しない）。1 回の set で反映する。
   */
  setTaskFieldValues: (
    ids: string[],
    field: PasteTextField,
    values: string[] | string
  ) => void;
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
  /**
   * 現在の予定を基準計画として保存する。
   * `register` は初回登録（既存の基準計画は上書き）、
   * `update` は再ベースライン（既存の基準計画を 1 世代前へ退避してから上書き）。
   */
  setBaseline: (mode: 'register' | 'update') => void;
  /** 1 世代前の基準計画と入れ替える（更新の取り消し）。 */
  restoreBaseline: () => void;
  /** 基準計画（現行・1 世代前）をすべて削除する。 */
  clearBaseline: () => void;
  /** ガントの基準計画バー表示を切り替える。 */
  setShowBaseline: (showBaseline: boolean) => void;
  setVisibleColumns: (columns: ColumnId[]) => void;
  setIntegratedColumns: (columns: ColumnId[]) => void;
  setDragState: (dragState: GanttDragState | null) => void;
  setMousePos: (mousePos: { x: number; y: number } | null) => void;
  requestScrollToToday: () => void;
}
