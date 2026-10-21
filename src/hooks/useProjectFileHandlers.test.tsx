import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectFileHandlers } from './useProjectFileHandlers';
import { useNotificationStore } from '../store/useNotificationStore';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';
import { CURRENT_SCHEMA_VERSION } from '../utils/planActualMigration';
import {
  EXCEL_KIND,
  PROJECT_JSON_KIND,
  type BinarySource,
  type FileIO,
  type FileKind,
} from '../platform/fileIO';
import type { Task } from '../types';

// Excel 生成は重いので、フックのテストではモジュールごと差し替える。
// 実際のブック生成は `src/utils/export.test.ts` で検証する。
vi.mock('../utils/export', () => ({
  buildExcelExportBuffer: vi.fn().mockRejectedValue(new Error('boom')),
}));

const initialState = useTaskStore.getState();

function createIO(overrides: Partial<FileIO> = {}): FileIO {
  return {
    openText: vi.fn().mockResolvedValue(null),
    saveText: vi.fn().mockResolvedValue('saved'),
    saveBinary: vi.fn().mockResolvedValue('saved'),
    ...overrides,
  };
}

function stubOpenText(content: unknown): FileIO {
  return createIO({ openText: vi.fn().mockResolvedValue(content as string | null) });
}

function validTask(): Task {
  return {
    id: 'x',
    parentId: null,
    title: 'X',
    startDate: '2026-05-25',
    endDate: '2026-05-25',
    duration: 1,
    progress: 0,
    status: '',
    isCollapsed: false,
    children: [],
    dependencies: [],
  };
}

describe('useProjectFileHandlers.handleLoad', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
    act(() => {
      useTaskStore.setState(initialState, true);
    });
  });

  it('notifies success when a valid project is loaded', async () => {
    const io = stubOpenText(
      JSON.stringify({ tasks: { x: validTask() }, rootIds: ['x'], schemaVersion: 3 })
    );

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleLoad();
    });

    expect(io.openText).toHaveBeenCalledWith(PROJECT_JSON_KIND);
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('info');
    expect(useTaskStore.getState().tasks['x'].title).toBe('X');
    expect(useTaskStore.getState().milestones).toEqual([]);
  });

  it('restores milestones when a v4 project is loaded', async () => {
    const io = stubOpenText(
      JSON.stringify({
        tasks: { x: validTask() },
        rootIds: ['x'],
        schemaVersion: 4,
        milestones: [
          { id: 'm1', title: '設計凍結', date: '2026-10-20' },
        ],
      })
    );

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('info');
    expect(useTaskStore.getState().milestones).toEqual([
      { id: 'm1', title: '設計凍結', date: '2026-10-20' },
    ]);
  });

  it('migrates a legacy project and notifies a warning', async () => {
    const io = stubOpenText(
      JSON.stringify({
        tasks: {
          x: {
            id: 'x',
            parentId: null,
            title: 'X',
            // 旧: 固定していた当初計画
            planStartDate: '2026-05-11',
            planEndDate: '2026-05-13',
            planDuration: 3,
            // 旧: 更新してきた日程
            startDate: '2026-05-25',
            endDate: '2026-05-27',
            duration: 3,
            progress: 100,
            status: '',
            isCollapsed: false,
            children: [],
            dependencies: [],
          },
        },
        rootIds: ['x'],
        projectConfig: { baselineLocked: true },
      })
    );

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('warning');

    const task = useTaskStore.getState().tasks['x'];
    // 旧「予定」= 基準計画、旧「実績」= 現在の日程として引き継がれる
    expect(task.baselineStartDate).toBe('2026-05-11');
    expect(task.baselineEndDate).toBe('2026-05-13');
    expect(task.startDate).toBe('2026-05-25');
    expect(task.endDate).toBe('2026-05-27');
  });

  it('notifies a warning with details when the file is repaired', async () => {
    const io = stubOpenText(
      JSON.stringify({
        tasks: { x: { id: 'x', parentId: null, title: 'X' } },
        rootIds: ['x'],
      })
    );

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('warning');
    expect(notifications[0].details?.length ?? 0).toBeGreaterThan(0);
  });

  it('notifies an error when the project cannot be loaded', async () => {
    const io = stubOpenText(JSON.stringify({ rootIds: [] })); // tasks 欠落

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('error');
  });

  it('notifies an error when the JSON is malformed', async () => {
    const io = stubOpenText('{ not json');

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('error');
  });

  it('does nothing when the file dialog is cancelled', async () => {
    const io = stubOpenText(null);

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleLoad();
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});

describe('useProjectFileHandlers.handleSave', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('writes the current schema version and milestones', async () => {
    const saveText = vi.fn().mockResolvedValue('saved');
    const io = createIO({ saveText });

    act(() => {
      useTaskStore.getState().addMilestone({
        title: '設計凍結',
        date: '2026-10-20',
      });
    });

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(saveText).toHaveBeenCalledTimes(1);
    const [fileName, content, kind] = saveText.mock.calls[0];
    expect(fileName).toMatch(/^wbs-project_\d{8}_\d{4}\.json$/);
    expect(kind).toBe(PROJECT_JSON_KIND);

    const payload = JSON.parse(content);
    expect(payload.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(payload.milestones).toEqual([
      expect.objectContaining({ title: '設計凍結', date: '2026-10-20' }),
    ]);
    expect(payload.tasks).toBeDefined();
    expect(payload.rootIds).toBeDefined();
    expect(payload.projectConfig).toBeDefined();
  });

  it('notifies an error when saving fails', async () => {
    const io = createIO({
      saveText: vi.fn().mockRejectedValue(new Error('disk full')),
    });

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleSave();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('error');
    expect(notifications[0].message).toBe('保存に失敗しました');
  });
});

describe('useProjectFileHandlers.handleExport', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
    act(() => {
      useTaskStore.setState(initialState, true);
    });
  });

  it('asks for a file name before generating the workbook', async () => {
    const saveBinary = vi.fn().mockResolvedValue('saved');
    const io = createIO({ saveBinary });

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleExport();
    });

    expect(saveBinary).toHaveBeenCalledTimes(1);
    const [fileName, kind, source] = saveBinary.mock.calls[0];
    expect(fileName).toMatch(/^project_gantt_\d{8}_\d{6}\.xlsx$/);
    expect(kind).toBe(EXCEL_KIND);
    // ExcelJS の読み込みは出力時に遅延させる（ここでは関数のまま渡る）
    expect(typeof source).toBe('function');
  });

  it('notifies an error when the workbook generation fails', async () => {
    const saveBinary = vi.fn(
      async (_name: string, _kind: FileKind, source: BinarySource) => {
        await (typeof source === 'function' ? source() : source);
        return 'saved' as const;
      }
    );
    const io = createIO({ saveBinary });

    const { result } = renderHook(() => useProjectFileHandlers(io));
    await act(async () => {
      await result.current.handleExport();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('error');
    expect(notifications[0].message).toBe('Excel 出力に失敗しました');
  });
});
