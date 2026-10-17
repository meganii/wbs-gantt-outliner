import { describe, it, expect } from 'vitest';
import { validateProjectState } from './validateProjectState';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    parentId: null,
    title: `Task ${overrides.id}`,
    startDate: null,
    endDate: null,
    duration: 1,
    progress: 0,
    status: '',
    isCollapsed: false,
    children: [],
    dependencies: [],
    planStartDate: null,
    planEndDate: null,
    planDuration: 1,
    ...overrides,
  };
}

describe('validateProjectState', () => {
  describe('正常系（互換性）', () => {
    it('accepts a valid project without warnings', () => {
      const tasks = {
        root: makeTask({ id: 'root', children: ['child'] }),
        child: makeTask({ id: 'child', parentId: 'root' }),
      };
      const result = validateProjectState({ tasks, rootIds: ['root'] });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warnings).toEqual([]);
      expect(result.rootIds).toEqual(['root']);
      expect(result.tasks['root'].parentId).toBe(null);
      expect(result.tasks['child'].parentId).toBe('root');
      expect(result.tasks['root'].children).toEqual(['child']);
    });

    it('keeps valid dates, numbers and config untouched', () => {
      const task = makeTask({
        id: 'x',
        startDate: '2026-05-25',
        endDate: '2026-05-26',
        planStartDate: '2026-05-25',
        planEndDate: '2026-05-26',
        duration: 2,
        progress: 30,
        planDuration: 2,
      });
      const result = validateProjectState({
        tasks: { x: task },
        rootIds: ['x'],
        projectConfig: { viewMode: 'Week', columnWidths: { taskName: 320 } },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warnings).toEqual([]);
      expect(result.tasks['x'].startDate).toBe('2026-05-25');
      expect(result.tasks['x'].progress).toBe(30);
      expect(result.projectConfig.viewMode).toBe('Week');
      expect(result.projectConfig.columnWidths.taskName).toBe(320);
      expect(result.projectConfig.columnWidths.date).toBe(224);
    });
  });

  describe('(a) tasks / rootIds の欠落・型違い', () => {
    it('rejects null', () => {
      expect(validateProjectState(null).ok).toBe(false);
    });

    it('rejects a non-object top-level value', () => {
      expect(validateProjectState('abc').ok).toBe(false);
      expect(validateProjectState([1, 2]).ok).toBe(false);
    });

    it('rejects when tasks is missing', () => {
      const result = validateProjectState({ rootIds: ['x'] });
      expect(result.ok).toBe(false);
    });

    it('rejects when tasks is an array', () => {
      const result = validateProjectState({ tasks: [], rootIds: [] });
      expect(result.ok).toBe(false);
    });

    it('repairs a missing rootIds by recomputing from the tree', () => {
      const tasks = {
        a: makeTask({ id: 'a', children: ['b'] }),
        b: makeTask({ id: 'b', parentId: 'a' }),
      };
      const result = validateProjectState({ tasks });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.rootIds).toEqual(['a']);
    });

    it('repairs a non-array rootIds and warns', () => {
      const tasks = { a: makeTask({ id: 'a' }) };
      const result = validateProjectState({ tasks, rootIds: 'a' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.rootIds).toEqual(['a']);
      expect(result.warnings.join('\n')).toContain('rootIds');
    });
  });

  describe('(b) タスクの型違い', () => {
    it('repairs missing children / dependencies to empty arrays and warns', () => {
      const broken = { id: 'x', parentId: null, title: 't' } as unknown;
      const result = validateProjectState({ tasks: { x: broken }, rootIds: ['x'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tasks['x'].children).toEqual([]);
      expect(result.tasks['x'].dependencies).toEqual([]);
      expect(result.warnings.join('\n')).toContain('配列でない');
    });

    it('repairs a numeric-string progress', () => {
      const broken = { ...makeTask({ id: 'x' }), progress: '50' } as unknown;
      const result = validateProjectState({ tasks: { x: broken }, rootIds: ['x'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tasks['x'].progress).toBe(50);
    });

    it('repairs a non-numeric progress and warns', () => {
      const broken = { ...makeTask({ id: 'x' }), progress: 'abc' } as unknown;
      const result = validateProjectState({ tasks: { x: broken }, rootIds: ['x'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tasks['x'].progress).toBe(0);
      expect(result.warnings.join('\n')).toContain('数値');
    });

    it('re-keys tasks by their id when the record key differs', () => {
      const task = makeTask({ id: 'real' });
      const result = validateProjectState({ tasks: { wrongKey: task }, rootIds: ['wrongKey'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.tasks)).toEqual(['real']);
      expect(result.rootIds).toEqual(['real']);
    });

    it('drops tasks without a usable id', () => {
      const result = validateProjectState({
        tasks: { ok: makeTask({ id: 'ok' }), bad: { title: 'no id' } },
        rootIds: ['ok'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.tasks)).toEqual(['ok']);
      expect(result.warnings.join('\n')).toContain('除外');
    });

    it('rejects when every task is unusable but tasks was non-empty', () => {
      const result = validateProjectState({ tasks: { bad: { title: 'no id' } }, rootIds: [] });
      expect(result.ok).toBe(false);
    });
  });

  describe('(c) 不正な日付', () => {
    it('clears invalid dates to null and warns', () => {
      const task = makeTask({
        id: 'x',
        startDate: 'abc',
        endDate: '2026-13-45',
        planStartDate: '2026-13-45',
        planEndDate: 'not-a-date',
      });
      const result = validateProjectState({ tasks: { x: task }, rootIds: ['x'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tasks['x'].startDate).toBe(null);
      expect(result.tasks['x'].endDate).toBe(null);
      expect(result.tasks['x'].planStartDate).toBe(null);
      expect(result.tasks['x'].planEndDate).toBe(null);
      expect(result.warnings.join('\n')).toContain('日付');
    });

    it('keeps valid yyyy-mm-dd dates', () => {
      const task = makeTask({ id: 'x', startDate: '2026-02-28', endDate: '2026-03-01' });
      const result = validateProjectState({ tasks: { x: task }, rootIds: ['x'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tasks['x'].startDate).toBe('2026-02-28');
      expect(result.tasks['x'].endDate).toBe('2026-03-01');
    });
  });

  describe('(d) 子（親子）の循環', () => {
    it('breaks a pure A<->B child cycle without losing tasks', () => {
      const a = makeTask({ id: 'A', children: ['B'] });
      const b = makeTask({ id: 'B', children: ['A'] });
      const result = validateProjectState({ tasks: { A: a, B: b }, rootIds: ['A', 'B'] });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.tasks).sort()).toEqual(['A', 'B']);
      expect(result.rootIds.length).toBe(1);
      expect(result.warnings.join('\n')).toContain('循環');
    });

    it('breaks a cycle reachable from a root (R -> A -> B <-> C)', () => {
      const tasks = {
        R: makeTask({ id: 'R', children: ['A'] }),
        A: makeTask({ id: 'A', parentId: 'R', children: ['B'] }),
        B: makeTask({ id: 'B', parentId: 'A', children: ['C'] }),
        C: makeTask({ id: 'C', parentId: 'B', children: ['B'] }),
      };
      const result = validateProjectState({ tasks, rootIds: ['R'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 循環が切れ、全タスクがルートから到達可能
      expect(result.rootIds).toEqual(['R']);
      const reachable = new Set<string>();
      const walk = (id: string) => {
        if (reachable.has(id)) return;
        reachable.add(id);
        result.tasks[id]?.children.forEach(walk);
      };
      result.rootIds.forEach(walk);
      expect([...reachable].sort()).toEqual(['A', 'B', 'C', 'R']);
    });

    it('de-duplicates a child referenced by multiple parents', () => {
      const tasks = {
        p1: makeTask({ id: 'p1', children: ['c'] }),
        p2: makeTask({ id: 'p2', children: ['c'] }),
        c: makeTask({ id: 'c' }),
      };
      const result = validateProjectState({ tasks, rootIds: ['p1', 'p2'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const parents = [result.tasks['p1'], result.tasks['p2']]
        .filter((t) => t.children.includes('c'))
        .map((t) => t.id);
      expect(parents.length).toBe(1);
      expect(result.warnings.join('\n')).toContain('親');
    });
  });

  describe('(e) 依存の循環', () => {
    it('breaks a dependency cycle A <-> B', () => {
      const a = makeTask({ id: 'A', dependencies: ['B'] });
      const b = makeTask({ id: 'B', dependencies: ['A'] });
      const result = validateProjectState({ tasks: { A: a, B: b }, rootIds: ['A', 'B'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const remaining = [
        ...result.tasks['A'].dependencies,
        ...result.tasks['B'].dependencies,
      ];
      // 循環が残っていない（両方向の依存が同時に存在しない）
      const cyclic = result.tasks['A'].dependencies.includes('B')
        && result.tasks['B'].dependencies.includes('A');
      expect(cyclic).toBe(false);
      expect(remaining.length).toBeLessThanOrEqual(1);
      expect(result.warnings.join('\n')).toContain('依存関係の循環');
    });

    it('keeps a valid acyclic dependency chain', () => {
      const a = makeTask({ id: 'A' });
      const b = makeTask({ id: 'B', dependencies: ['A'] });
      const c = makeTask({ id: 'C', dependencies: ['B'] });
      const result = validateProjectState({ tasks: { A: a, B: b, C: c }, rootIds: ['A', 'B', 'C'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tasks['C'].dependencies).toEqual(['B']);
      expect(result.tasks['B'].dependencies).toEqual(['A']);
    });
  });

  describe('参照の掃除', () => {
    it('removes missing, self and duplicate references', () => {
      const task = makeTask({
        id: 'x',
        children: ['ghost', 'x', 'x'],
        dependencies: ['ghost2', 'x', 'x'],
      });
      const result = validateProjectState({ tasks: { x: task }, rootIds: ['x'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tasks['x'].children).toEqual([]);
      expect(result.tasks['x'].dependencies).toEqual([]);
      expect(result.warnings.join('\n')).toContain('存在しない');
    });
  });

  describe('(f) projectConfig の形', () => {
    it('repairs bad calendar / viewMode / columnWidths / timelineRange and warns', () => {
      const result = validateProjectState({
        tasks: { x: makeTask({ id: 'x' }) },
        rootIds: ['x'],
        projectConfig: {
          calendar: { workDays: 'mon-fri', holidays: 'none' },
          viewMode: 'Nope',
          columnWidths: { taskName: 'wide' },
          timelineRange: { start: 123, end: 'garbage' },
          baselineLocked: 'yes',
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const pc = result.projectConfig;
      expect(pc.calendar.workDays).toEqual([1, 2, 3, 4, 5]);
      expect(pc.calendar.holidays).toEqual([]);
      expect(pc.viewMode).toBe('Day');
      expect(pc.columnWidths.taskName).toBe(200);
      expect(pc.timelineRange).toBeUndefined();
      expect(pc.baselineLocked).toBe(false);
      expect(result.warnings.join('\n')).toContain('列幅');
      expect(result.warnings.join('\n')).toContain('timelineRange');
    });

    it('keeps a valid timelineRange', () => {
      const result = validateProjectState({
        tasks: { x: makeTask({ id: 'x' }) },
        rootIds: ['x'],
        projectConfig: { timelineRange: { start: '2026-01-01', end: '2026-12-31' } },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.projectConfig.timelineRange).toEqual({
        start: '2026-01-01',
        end: '2026-12-31',
      });
    });

    it('drops a reversed timelineRange', () => {
      const result = validateProjectState({
        tasks: { x: makeTask({ id: 'x' }) },
        rootIds: ['x'],
        projectConfig: { timelineRange: { start: '2026-12-31', end: '2026-01-01' } },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.projectConfig.timelineRange).toBeUndefined();
    });
  });
});
