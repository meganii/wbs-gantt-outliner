import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from './useNotificationStore';

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
  });

  it('adds a notification and returns its id', () => {
    const id = useNotificationStore.getState().notify({
      level: 'warning',
      message: '注意',
      details: ['詳細1', '詳細2'],
    });

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({
      id,
      level: 'warning',
      message: '注意',
      details: ['詳細1', '詳細2'],
    });
  });

  it('dismisses a notification by id', () => {
    const id = useNotificationStore.getState().notify({ level: 'info', message: 'a' });
    useNotificationStore.getState().notify({ level: 'error', message: 'b' });

    useNotificationStore.getState().dismiss(id);

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe('b');
  });

  it('clears every notification', () => {
    useNotificationStore.getState().notify({ level: 'info', message: 'a' });
    useNotificationStore.getState().notify({ level: 'info', message: 'b' });

    useNotificationStore.getState().clear();

    expect(useNotificationStore.getState().notifications).toEqual([]);
  });
});
