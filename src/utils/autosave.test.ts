import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOSAVE_STORAGE_KEY,
  clearAutosave,
  readAutosave,
  serializeProject,
  writeAutosave,
  type ProjectSnapshot,
} from './autosave';
import { CURRENT_SCHEMA_VERSION } from './planActualMigration';
import { DEFAULT_PROJECT_CONFIG } from './projectConfig';
import type { Task } from '../types';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    parentId: null,
    startDate: null,
    endDate: null,
    duration: 0,
    progress: 0,
    status: '',
    isCollapsed: false,
    children: [],
    dependencies: [],
    ...partial,
  };
}

function snapshot(): ProjectSnapshot {
  return serializeProject({
    tasks: { x: task({ id: 'x', title: '設計' }) },
    rootIds: ['x'],
    projectConfig: DEFAULT_PROJECT_CONFIG,
    milestones: [{ id: 'm1', title: 'レビュー', date: '2026-05-20' }],
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('serializeProject', () => {
  it('adds the current schema version to the project state', () => {
    const project = snapshot();

    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.rootIds).toEqual(['x']);
    expect(project.tasks.x.title).toBe('設計');
    expect(project.milestones).toHaveLength(1);
  });
});

describe('autosave storage', () => {
  it('round-trips the project and the dirty flag', () => {
    const project = snapshot();

    expect(writeAutosave(project, true)).toBe(true);

    const envelope = readAutosave();
    expect(envelope?.dirty).toBe(true);
    expect(envelope?.project.tasks.x.title).toBe('設計');
    expect(envelope?.project.milestones[0].title).toBe('レビュー');
    expect(typeof envelope?.savedAt).toBe('string');
  });

  it('records a clean state after an explicit save', () => {
    writeAutosave(snapshot(), true);
    writeAutosave(snapshot(), false);

    expect(readAutosave()?.dirty).toBe(false);
  });

  it('discards data that is not valid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, '{ broken');

    expect(readAutosave()).toBeNull();
    expect(localStorage.getItem(AUTOSAVE_STORAGE_KEY)).toBeNull();
    warn.mockRestore();
  });

  it('discards data written by an unknown version', () => {
    localStorage.setItem(
      AUTOSAVE_STORAGE_KEY,
      JSON.stringify({ version: 99, savedAt: '', dirty: false, project: {} })
    );

    expect(readAutosave()).toBeNull();
    expect(localStorage.getItem(AUTOSAVE_STORAGE_KEY)).toBeNull();
  });

  it('clears the entry', () => {
    writeAutosave(snapshot(), true);
    clearAutosave();

    expect(localStorage.getItem(AUTOSAVE_STORAGE_KEY)).toBeNull();
  });

  it('returns false instead of throwing when storage is full', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(writeAutosave(snapshot(), true, storage)).toBe(false);
    warn.mockRestore();
  });
});
