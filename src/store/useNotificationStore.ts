import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type NotificationLevel = 'info' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  level: NotificationLevel;
  message: string;
  /** 補足（修復内容の一覧など）。 */
  details?: string[];
}

export interface NotifyInput {
  level: NotificationLevel;
  message: string;
  details?: string[];
}

interface NotificationStoreState {
  notifications: AppNotification[];
  notify: (input: NotifyInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/**
 * アプリ内の一時通知（トースト）を保持する軽量ストア。
 * UI から独立しているため、IPC ハンドラなど非 React な場所からも呼べる。
 */
export const useNotificationStore = create<NotificationStoreState>((set) => ({
  notifications: [],
  notify: ({ level, message, details }) => {
    const id = uuidv4();
    set((state) => ({
      notifications: [...state.notifications, { id, level, message, details }],
    }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((notification) => notification.id !== id),
    })),
  clear: () => set({ notifications: [] }),
}));
