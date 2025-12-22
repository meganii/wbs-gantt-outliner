import { describe, it, expect } from 'vitest';
import { flattenTree } from './tree';
import type { Task } from '../types';

describe('flattenTree', () => {
  const tasks: Record<string, Task> = {
    root1: { id: 'root1', title: 'Root 1', children: ['child1', 'child2'], parentId: null, isCollapsed: false, startDate: '', endDate: '', duration: 1, progress: 0, dependencies: [] },
    root2: { id: 'root2', title: 'Root 2', children: [], parentId: null, isCollapsed: false, startDate: '', endDate: '', duration: 1, progress: 0, dependencies: [] },
    child1: { id: 'child1', title: 'Child 1', children: ['grandchild1'], parentId: 'root1', isCollapsed: false, startDate: '', endDate: '', duration: 1, progress: 0, dependencies: [] },
    child2: { id: 'child2', title: 'Child 2', children: [], parentId: 'root1', isCollapsed: false, startDate: '', endDate: '', duration: 1, progress: 0, dependencies: [] },
    grandchild1: { id: 'grandchild1', title: 'Grandchild 1', children: [], parentId: 'child1', isCollapsed: false, startDate: '', endDate: '', duration: 1, progress: 0, dependencies: [] },
  };
  const rootIds = ['root1', 'root2'];

  it('should flatten the tree structure correctly', () => {
    const flattened = flattenTree(tasks, rootIds);
    expect(flattened.map(item => item.id)).toEqual(['root1', 'child1', 'grandchild1', 'child2', 'root2']);
  });

  it('should assign correct depth to each item', () => {
    const flattened = flattenTree(tasks, rootIds);
    expect(flattened.map(item => item.depth)).toEqual([0, 1, 2, 1, 0]);
  });

  it('should assign correct WBS numbers', () => {
    const flattened = flattenTree(tasks, rootIds);
    expect(flattened.map(item => item.wbsNumber)).toEqual(['1', '1.1', '1.1.1', '1.2', '2']);
  });

  it('should not include children of a collapsed task', () => {
    const collapsedTasks = {
      ...tasks,
      root1: { ...tasks.root1, isCollapsed: true },
    };
    const flattened = flattenTree(collapsedTasks, rootIds);
    expect(flattened.map(item => item.id)).toEqual(['root1', 'root2']);
  });

  it('should handle an empty tree', () => {
    const flattened = flattenTree({}, []);
    expect(flattened).toEqual([]);
  });
});
