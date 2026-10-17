/**
 * 性能計測用の決定的なサンプルプロジェクト生成器。
 *
 * - `Math.random()` / 現在時刻を使わない（同じ入力なら常に同じ JSON になる）。
 * - 3 階層（フェーズ → グループ → リーフ）のツリーを生成し、各リーフに
 *   予定日付・実績日付・進捗・一部の依存関係を割り当てる。
 * - 出力形式はアプリの保存形式（`{ tasks, rootIds, projectConfig }`）に合わせている。
 */

const BASE_DATE = new Date(2026, 9, 5); // 2026-10-05 (月)
const STATUSES = ['未着手', '進行中', '完了'];
const DEFAULT_PROJECT_CONFIG = {
  calendar: { workDays: [1, 2, 3, 4, 5], holidays: [] },
  viewMode: 'Day',
  columnWidths: {
    taskName: 200,
    description: 256,
    assignee: 128,
    deliverables: 192,
    status: 100,
    progress: 80,
    planDuration: 64,
    planDate: 224,
    duration: 64,
    date: 224,
  },
  baselineLocked: false,
  visibleColumns: [
    'taskName',
    'description',
    'assignee',
    'deliverables',
    'status',
    'progress',
    'planDuration',
    'planDate',
    'duration',
    'date',
  ],
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** 土日を飛ばして営業日を加算する（祝日は扱わない）。 */
function addWorkDays(date, days) {
  let current = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    current = addDays(current, 1);
    if (!isWeekend(current)) {
      remaining -= 1;
    }
  }
  return current;
}

const LEAF_DURATION = 3; // 営業日
const LEAF_STEP = 4; // リーフの開始間隔（営業日）
const GROUP_STEP = 50; // グループの開始間隔（営業日）
const PHASE_STEP = 4; // フェーズの開始間隔（営業日）

/**
 * @param {number} count 生成するタスク総数（親タスクを含む）
 * @returns {{ tasks: Record<string, object>, rootIds: string[], projectConfig: object }}
 */
export function generateProjectData(count = 1000) {
  // ルート数は総数から逆算する（1000 件なら 25 フェーズ）。
  const numRoots = Math.max(1, Math.min(40, Math.round(count / 40)));
  const groupsPerPhase = 3;
  const numGroups = numRoots * groupsPerPhase;
  const leafTotal = Math.max(numGroups, count - numRoots - numGroups);

  const tasks = {};
  const rootIds = [];

  // リーフを全グループへ均等に配分する。
  const leavesPerGroup = new Array(numGroups).fill(Math.floor(leafTotal / numGroups));
  for (let i = 0; i < leafTotal % numGroups; i += 1) {
    leavesPerGroup[i] += 1;
  }

  let leafCursor = 0;

  for (let p = 0; p < numRoots; p += 1) {
    const phaseId = `task-${String(p + 1).padStart(4, '0')}`;
    const phaseStart = addWorkDays(BASE_DATE, p * PHASE_STEP);
    const groupIds = [];
    let phaseMinStart = null;
    let phaseMaxEnd = null;

    for (let g = 0; g < groupsPerPhase; g += 1) {
      const groupId = `task-${String(p * groupsPerPhase + g + 1).padStart(4, '0')}-g`;
      const groupStart = addWorkDays(phaseStart, g * GROUP_STEP);
      const childIds = [];
      let groupMinStart = null;
      let groupMaxEnd = null;

      const leafCount = leavesPerGroup[p * groupsPerPhase + g];
      for (let l = 0; l < leafCount; l += 1) {
        const leafId = `leaf-${String(leafCursor + 1).padStart(4, '0')}`;
        leafCursor += 1;

        const start = addWorkDays(groupStart, l * LEAF_STEP);
        const end = addWorkDays(start, LEAF_DURATION - 1);
        const progress = (l * 8 + g * 5 + p * 3) % 101;

        // リーフ内の依存関係（疎に張る: 3 件に 1 本程度）
        const dependencies = [];
        if (l >= 3 && (l - 3) % 4 === 0) {
          dependencies.push(`leaf-${String(leafCursor - 3).padStart(4, '0')}`);
        }

        tasks[leafId] = {
          id: leafId,
          parentId: groupId,
          title: `タスク ${leafCursor}`,
          description: '',
          assignee: '',
          deliverables: '',
          startDate: formatDate(start),
          endDate: formatDate(end),
          duration: LEAF_DURATION,
          progress,
          status: STATUSES[Math.floor(progress / 34)],
          isCollapsed: false,
          children: [],
          dependencies,
          planStartDate: formatDate(start),
          planEndDate: formatDate(end),
          planDuration: LEAF_DURATION,
        };

        childIds.push(leafId);
        if (!groupMinStart || start < groupMinStart) groupMinStart = start;
        if (!groupMaxEnd || end > groupMaxEnd) groupMaxEnd = end;
      }

      tasks[groupId] = {
        id: groupId,
        parentId: phaseId,
        title: `グループ ${p + 1}-${g + 1}`,
        description: '',
        assignee: '',
        deliverables: '',
        startDate: formatDate(groupMinStart),
        endDate: formatDate(groupMaxEnd),
        duration: LEAF_DURATION,
        progress: 0,
        status: '',
        isCollapsed: false,
        children: childIds,
        dependencies: [],
        planStartDate: formatDate(groupMinStart),
        planEndDate: formatDate(groupMaxEnd),
        planDuration: LEAF_DURATION,
      };

      groupIds.push(groupId);
      if (!phaseMinStart || groupMinStart < phaseMinStart) phaseMinStart = groupMinStart;
      if (!phaseMaxEnd || groupMaxEnd > phaseMaxEnd) phaseMaxEnd = groupMaxEnd;
    }

    tasks[phaseId] = {
      id: phaseId,
      parentId: null,
      title: `フェーズ ${p + 1}`,
      description: '',
      assignee: '',
      deliverables: '',
      startDate: formatDate(phaseMinStart),
      endDate: formatDate(phaseMaxEnd),
      duration: LEAF_DURATION,
      progress: 0,
      status: '',
      isCollapsed: false,
      children: groupIds,
      dependencies: [],
      planStartDate: formatDate(phaseMinStart),
      planEndDate: formatDate(phaseMaxEnd),
      planDuration: LEAF_DURATION,
    };

    rootIds.push(phaseId);
  }

  return { tasks, rootIds, projectConfig: DEFAULT_PROJECT_CONFIG };
}

export const PROJECT_CONFIG = DEFAULT_PROJECT_CONFIG;
