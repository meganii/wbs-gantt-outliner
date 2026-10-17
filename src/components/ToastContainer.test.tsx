import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastContainer } from './ToastContainer';
import { useNotificationStore } from '../store/useNotificationStore';

describe('ToastContainer', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there are no notifications', () => {
    const { container } = render(<ToastContainer />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a notification with its details', () => {
    render(<ToastContainer />);

    act(() => {
      useNotificationStore.getState().notify({
        level: 'warning',
        message: '警告があります',
        details: ['不正な日付 2 件を未設定にしました'],
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('警告があります');
    expect(screen.getByText('不正な日付 2 件を未設定にしました')).toBeInTheDocument();
  });

  it('dismisses the notification when the close button is clicked', () => {
    render(<ToastContainer />);

    act(() => {
      useNotificationStore.getState().notify({ level: 'error', message: '失敗しました' });
    });

    fireEvent.click(screen.getByRole('button', { name: '通知を閉じる' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('auto-dismisses info/warning notifications after the timeout', () => {
    vi.useFakeTimers();
    render(<ToastContainer />);

    act(() => {
      useNotificationStore.getState().notify({ level: 'warning', message: '一時的な警告' });
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(12000);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps error notifications until they are dismissed', () => {
    vi.useFakeTimers();
    render(<ToastContainer />);

    act(() => {
      useNotificationStore.getState().notify({ level: 'error', message: '重大なエラー' });
    });

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('重大なエラー');
  });
});
