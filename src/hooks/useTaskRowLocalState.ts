import { useState, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { Task, TaskFocusableField } from '../types';

export function useTaskRowLocalState(taskId: string, task: Task | undefined) {
  const updateTask = useTaskStore((state) => state.updateTask);

  const [localTitle, setLocalTitle] = useState(task?.title || '');
  const [localDescription, setLocalDescription] = useState(task?.description || '');
  const [localAssignee, setLocalAssignee] = useState(task?.assignee || '');
  const [localDeliverables, setLocalDeliverables] = useState(task?.deliverables || '');
  const [localStatus, setLocalStatus] = useState(task?.status || '');
  const [localProgress, setLocalProgress] = useState(
    task?.progress !== undefined ? String(task.progress) : '0'
  );

  const taskTitle = task?.title ?? '';
  const taskDescription = task?.description || '';
  const taskAssignee = task?.assignee || '';
  const taskDeliverables = task?.deliverables || '';
  const taskStatus = task?.status || '';
  const taskProgress = task?.progress !== undefined ? String(task.progress) : '0';

  // Sync local state if external state changes (e.g. undo/redo)
  useEffect(() => {
    setLocalTitle(taskTitle);
    setLocalDescription(taskDescription);
    setLocalAssignee(taskAssignee);
    setLocalDeliverables(taskDeliverables);
    setLocalStatus(taskStatus);
    setLocalProgress(taskProgress);
  }, [taskTitle, taskDescription, taskAssignee, taskDeliverables, taskStatus, taskProgress]);

  const commitFieldLocalState = (field: TaskFocusableField) => {
    if (!task) return;

    if (field === 'title' && task.title !== localTitle) {
      updateTask(taskId, { title: localTitle });
    } else if (field === 'description' && task.description !== localDescription) {
      updateTask(taskId, { description: localDescription });
    } else if (field === 'assignee' && task.assignee !== localAssignee) {
      updateTask(taskId, { assignee: localAssignee });
    } else if (field === 'deliverables' && task.deliverables !== localDeliverables) {
      updateTask(taskId, { deliverables: localDeliverables });
    } else if (field === 'status' && task.status !== localStatus) {
      updateTask(taskId, { status: localStatus });
    } else if (field === 'progress') {
      const parsed = Math.min(100, Math.max(0, parseInt(localProgress) || 0));
      if (task.progress !== parsed) {
        updateTask(taskId, { progress: parsed });
      }
    }
  };

  return {
    localTitle,
    setLocalTitle,
    localDescription,
    setLocalDescription,
    localAssignee,
    setLocalAssignee,
    localDeliverables,
    setLocalDeliverables,
    localStatus,
    setLocalStatus,
    localProgress,
    setLocalProgress,
    commitFieldLocalState,
  };
}
