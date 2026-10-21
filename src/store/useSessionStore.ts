import { create } from 'zustand';

/**
 * セッション（画面を開いている間）の状態。
 *
 * `dirty` は「最後に JSON 保存 / 読込してから変更があるか」を表す。
 * タスクの編集履歴（zundo）とは独立させたいので、タスクストアには入れない。
 */
interface SessionStoreState {
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  dirty: false,
  setDirty: (dirty) => set({ dirty }),
}));
