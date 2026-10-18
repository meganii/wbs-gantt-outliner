import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render, within } from '@testing-library/react';
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

  it('selects task row on normal click, and extends range on Shift + click', () => {
    const firstId = useTaskStore.getState().rootIds[0];

    act(() => {
      useTaskStore.getState().addTask(firstId, 'after');
    });

    const secondId = useTaskStore.getState().rootIds[1];
    
    act(() => {
      useTaskStore.getState().addTask(secondId, 'after');
    });
    const thirdId = useTaskStore.getState().rootIds[2];

    const { container } = render(<Outliner showDetails />);
    
    // Locate the first task Title input
    const firstTitleInput = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${firstId}"][data-field="title"]`
    );
    expect(firstTitleInput).not.toBeNull();

    // Click normally on the first task title input
    fireEvent.mouseDown(firstTitleInput!);
    expect(useTaskStore.getState().selectedTaskIds).toEqual([firstId]);

    // Locate the third task Title input
    const thirdTitleInput = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${thirdId}"][data-field="title"]`
    );
    expect(thirdTitleInput).not.toBeNull();

    // Shift + click on the third task title input
    fireEvent.mouseDown(thirdTitleInput!, { shiftKey: true });
    
    // Verify that first, second, and third tasks are all selected!
    expect(useTaskStore.getState().selectedTaskIds).toEqual([firstId, secondId, thirdId]);
  });

  it('toggles column visibility through header right-click context menu', () => {
    const { container, getByText } = render(<Outliner showDetails />);
    
    // Check initially description column is visible (it has width or is present in DOM)
    const descriptionCol = getByText('説明');
    expect(descriptionCol).not.toBeNull();

    // Right-click the header
    const header = container.querySelector('.sticky'); // Header container is sticky top-0
    expect(header).not.toBeNull();
    fireEvent.contextMenu(header!);

    // Context menu container should appear
    const menuContainer = container.querySelector('.fixed.bg-white') as HTMLElement;
    expect(menuContainer).not.toBeNull();

    // Find "説明" checkbox/label inside the menu
    const descriptionLabel = within(menuContainer).getByText('説明');
    expect(descriptionLabel).not.toBeNull();

    // Click to toggle "説明" (description) off
    fireEvent.click(descriptionLabel);

    // Verify it is removed from visibleColumns in store
    expect(useTaskStore.getState().projectConfig.visibleColumns).not.toContain('description');

    // Right click again to toggle it back on
    fireEvent.contextMenu(header!);
    const menuContainer2 = container.querySelector('.fixed.bg-white') as HTMLElement;
    const descriptionLabel2 = within(menuContainer2).getByText('説明');
    fireEvent.click(descriptionLabel2);

    // Verify it is present in store again
    expect(useTaskStore.getState().projectConfig.visibleColumns).toContain('description');
  });

  it('予定列・実績列の表示トグルが通常どおり操作できる（固定トグルは廃止）', () => {
    const { container } = render(<Outliner showDetails />);
    const header = container.querySelector('.sticky');
    fireEvent.contextMenu(header!);

    const menuContainer = container.querySelector('.fixed.bg-white') as HTMLElement;
    expect(menuContainer).not.toBeNull();

    // 予定期間・実績期間のどちらも無効化されない（チェックボックスは操作可能）
    const planDurationLabel = within(menuContainer).getByText('予定期間');
    const planCheckbox = (planDurationLabel.querySelector('input[type="checkbox"]') || planDurationLabel.parentElement?.querySelector('input[type="checkbox"]')) as HTMLInputElement;
    expect(planCheckbox).not.toBeNull();
    expect(planCheckbox.disabled).toBe(false);

    const durationLabel = within(menuContainer).getByText('実績期間');
    const actualCheckbox = (durationLabel.querySelector('input[type="checkbox"]') || durationLabel.parentElement?.querySelector('input[type="checkbox"]')) as HTMLInputElement;
    expect(actualCheckbox).not.toBeNull();
    expect(actualCheckbox.disabled).toBe(false);
  });

  /**
   * WBS ビューは App 側の `overflow-auto` ラッパーの中に置かれている。
   * Outliner 自身が `overflow-x-auto`（= 縦横ともスクロールコンテナ）を持つと、
   * ヘッダーの `sticky top-0` が「実際には動かない Outliner 自身」を基準にして
   * しまい、縦スクロールで列名が流れていく。ここでは Outliner 自身が
   * スクロールコンテナになっていないこと（= 親の縦スクロールに追従すること）を固定する。
   */
  it('列名ヘッダーが縦スクロールに追従できるよう、Outliner 自身はスクロールコンテナにしない', () => {
    const { container } = render(<Outliner showDetails />);

    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).not.toContain('overflow-x-auto');
    expect(root.className).not.toContain('overflow-auto');

    // ヘッダーは sticky top-0（縦スクロールで上に固定される）であること
    const header = container.querySelector('.sticky') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.className).toContain('top-0');
  });
});
