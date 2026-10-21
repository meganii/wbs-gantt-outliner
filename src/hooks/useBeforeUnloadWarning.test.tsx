import { beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useBeforeUnloadWarning } from './useBeforeUnloadWarning';
import { useSessionStore } from '../store/useSessionStore';

function Probe() {
  useBeforeUnloadWarning();
  return null;
}

function fireBeforeUnload(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  useSessionStore.setState({ dirty: false });
});

describe('useBeforeUnloadWarning', () => {
  it('does not block when there are no unsaved changes', () => {
    render(<Probe />);

    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it('blocks reloads while there are unsaved changes', () => {
    render(<Probe />);

    act(() => {
      useSessionStore.setState({ dirty: true });
    });

    expect(fireBeforeUnload().defaultPrevented).toBe(true);
  });

  it('stops blocking after the changes are saved', () => {
    render(<Probe />);

    act(() => {
      useSessionStore.setState({ dirty: true });
    });
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    act(() => {
      useSessionStore.setState({ dirty: false });
    });
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});
