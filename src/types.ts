export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  description?: string;
  assignee?: string;
  deliverables?: string;
  /**
   * 現在の日程（開始）。ISO 8601 YYYY-MM-DD。
   * 進捗率 0% は「予定（見込み）」、1% 以上は「実績」として読む（役割は進捗率が決める）。
   */
  startDate: string | null;
  /**
   * 現在の日程（終了）。ISO 8601 YYYY-MM-DD。
   * 進捗率 100% は「実績」、1〜99% は「予定（見込み）」として読む。
   */
  endDate: string | null;
  /**
   * 期間（稼働日数）。開始日〜終了日から導出される値で、独立した入力は持たない
   * （期間セルからの入力は終了日を動かすだけで、保存値は常に稼働日数）。
   */
  duration: number;
  progress: number;  // 0-100
  /** ステータス。進捗率から導出される表示用の値（手入力しない）。 */
  status?: string;
  isCollapsed: boolean;
  children: string[]; // Ordered list of child IDs
  dependencies: string[]; // Array of Task IDs
  /** 基準計画（登録時のスナップショット）。通常運用では不変。 */
  baselineStartDate?: string | null;
  baselineEndDate?: string | null;
  baselineDuration?: number | null;
  /** 1 世代前の基準計画（「基準計画を更新」の退避先）。 */
  previousBaselineStartDate?: string | null;
  previousBaselineEndDate?: string | null;
  previousBaselineDuration?: number | null;
}

/**
 * プロジェクト直下のマイルストーン（チェックポイント）。
 * タスクとは独立したデータで、Phase 1 ではタスクの日程計算に影響しない。
 */
export interface Milestone {
  id: string;
  title: string;
  /** ISO 8601 YYYY-MM-DD。 */
  date: string;
  note?: string;
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
    duration: number;
    date: number;
  };
  /** 「基準計画として登録」した日時（ISO 8601）。未登録は null。 */
  baselineSetAt?: string | null;
  /** ガントで基準計画バーを表示するか（既定 true）。 */
  showBaseline?: boolean;
  /** ガント上部のマイルストーンバンドを表示するか（既定 true）。 */
  showMilestones?: boolean;
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
  /** スケジュール上部に表示するチェックポイント（タスクとは独立）。 */
  milestones: Milestone[];
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
  /**
   * 複数タスクの開始日 / 終了日を 1 回の set でまとめて更新する。
   * values が 1 要素なら全行に同一値、複数要素なら ids の順に対応させる。
   * null / undefined の行は変更しない（不正な貼り付け値をスキップするため）。
   */
  setTaskDateValues: (
    ids: string[],
    field: 'startDate' | 'endDate',
    values: Array<string | null | undefined>
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
  /** マイルストーンを追加し、生成した ID を返す（不正な日付なら追加しない）。 */
  addMilestone: (input: { title: string; date: string; note?: string }) => string;
  /** マイルストーンを更新する（日付が不正なら何もしない。`note: ''` でメモを削除）。 */
  updateMilestone: (
    id: string,
    updates: Partial<Pick<Milestone, 'title' | 'date' | 'note'>>
  ) => void;
  deleteMilestone: (id: string) => void;
  /** ガント上部のマイルストーンバンド表示を切り替える。 */
  setShowMilestones: (showMilestones: boolean) => void;
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
