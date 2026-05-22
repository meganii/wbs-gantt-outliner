import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { Outliner } from './Outliner';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

describe('Outliner keyboard navigation', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('moves focus between description cells with arrow keys', () => {
    const firstId = useTaskStore.getState().rootIds[0];

    act(() => {
      useTaskStore.getState().addTask(firstId, 'after');
    });

    const secondId = useTaskStore.getState().rootIds[1];

    act(() => {
      useTaskStore.getState().updateTask(firstId, { description: 'First description' });
      useTaskStore.getState().updateTask(secondId, { description: 'Second description' });
    });

    const { container } = render(<Outliner showDetails />);
    const firstDescription = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${firstId}"][data-field="description"]`
    );
    const secondDescription = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${secondId}"][data-field="description"]`
    );

    expect(firstDescription).not.toBeNull();
    expect(secondDescription).not.toBeNull();

    fireEvent.focus(firstDescription!);
    fireEvent.keyDown(firstDescription!, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(secondDescription);
    expect(useTaskStore.getState().focusedTaskId).toBe(secondId);
    expect(useTaskStore.getState().focusedTaskField).toBe('description');

    fireEvent.keyDown(secondDescription!, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(firstDescription);
    expect(useTaskStore.getState().focusedTaskId).toBe(firstId);
    expect(useTaskStore.getState().focusedTaskField).toBe('description');
  });

  it('moves focus between duration cells with arrow keys', () => {
    const firstId = useTaskStore.getState().rootIds[0];

    act(() => {
      useTaskStore.getState().addTask(firstId, 'after');
    });

    const secondId = useTaskStore.getState().rootIds[1];
    const { container } = render(<Outliner showDetails />);
    const firstDuration = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${firstId}"][data-field="duration"]`
    );
    const secondDuration = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${secondId}"][data-field="duration"]`
    );

    expect(firstDuration).not.toBeNull();
    expect(secondDuration).not.toBeNull();

    fireEvent.focus(firstDuration!);
    fireEvent.keyDown(firstDuration!, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(secondDuration);
    expect(useTaskStore.getState().focusedTaskId).toBe(secondId);
    expect(useTaskStore.getState().focusedTaskField).toBe('duration');
  });

  it('indents and outdents task with Alt+Shift+ArrowRight/Left keys', () => {
    const firstId = useTaskStore.getState().rootIds[0];

    act(() => {
      useTaskStore.getState().addTask(firstId, 'after');
    });

    const secondId = useTaskStore.getState().rootIds[1];
    const { container } = render(<Outliner showDetails />);
    const secondTitle = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${secondId}"][data-field="title"]`
    );

    expect(secondTitle).not.toBeNull();

    // Focus title and trigger Alt+Shift+ArrowRight to indent
    fireEvent.focus(secondTitle!);
    fireEvent.keyDown(secondTitle!, {
      key: 'ArrowRight',
      altKey: true,
      shiftKey: true,
    });

    // Check if second task is now a child of the first task
    const secondTask = useTaskStore.getState().tasks[secondId];
    const firstTask = useTaskStore.getState().tasks[firstId];
    expect(firstTask.children).toContain(secondId);
    expect(secondTask.parentId).toBe(firstId);

    // Trigger Alt+Shift+ArrowLeft to outdent
    fireEvent.keyDown(secondTitle!, {
      key: 'ArrowLeft',
      altKey: true,
      shiftKey: true,
    });

    // Check if second task is a root task again
    const secondTaskAfter = useTaskStore.getState().tasks[secondId];
    const firstTaskAfter = useTaskStore.getState().tasks[firstId];
    expect(firstTaskAfter.children).not.toContain(secondId);
    expect(secondTaskAfter.parentId).toBeNull();
  });
});
