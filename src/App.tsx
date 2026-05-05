import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { Outliner } from './components/Outliner';
import { GanttChart } from './components/GanttChart';
import { IntegratedView } from './components/IntegratedView';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
import { getTemporalState, loadProjectState, useTaskStore } from './store/useTaskStore';
import clsx from 'clsx';
import { CalendarDays, ChevronDown, Undo, Redo } from 'lucide-react';
import { flattenTree } from './utils/tree';

function App() {
  const [view, setView] = useState<'wbs' | 'integrated' | 'gantt'>('integrated');
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  const tasks = useTaskStore(state => state.tasks);
  const rootIds = useTaskStore(state => state.rootIds);
  const projectConfig = useTaskStore(state => state.projectConfig);
  const setAllCollapsed = useTaskStore(state => state.setAllCollapsed);
  const visibleItems = useMemo(() => flattenTree(tasks, rootIds), [tasks, rootIds]);
  const collapsibleTasks = useMemo(
    () => Object.values(tasks).filter((task) => task.children.length > 0),
    [tasks]
  );
  const canExpandAll = collapsibleTasks.some((task) => task.isCollapsed);
  const canCollapseAll = collapsibleTasks.some((task) => !task.isCollapsed);

  const temporalState = useStore(useTaskStore.temporal, (state) => state);

  const { undo, redo, pastStates, futureStates } = temporalState;

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const [outlinerWidth, setOutlinerWidth] = useState(600);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const minWidth =
        projectConfig.columnWidths.taskDescription +
        projectConfig.columnWidths.duration +
        projectConfig.columnWidths.date +
        16;
      const maxWidth = Math.max(minWidth, window.innerWidth - 240);
      setOutlinerWidth(Math.min(Math.max(e.clientX, minWidth), maxWidth));
    }
  }, [isResizing, projectConfig.columnWidths]);

  const handleSave = async () => {
    const data = JSON.stringify({ tasks, rootIds, projectConfig }, null, 2);
    await window.ipcRenderer.invoke('save-file', data);
  };

  const handleLoad = async () => {
    const content = await window.ipcRenderer.invoke('load-file');
    if (content) {
      try {
        const data = JSON.parse(content);
        loadProjectState(data);
      } catch (e) {
        console.error('Failed to parse project file', e);
      }
    }
  };

  const handleExport = async () => {
    await window.ipcRenderer.invoke('export-excel', {
      tasks,
      rootIds,
      projectConfig,
    });
  };

  // Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
      const isRedo = (e.ctrlKey || e.metaKey) && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y');
      const isCollapseAll = (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key === 'ArrowUp';
      const isExpandAll = (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key === 'ArrowDown';

      if (e.isComposing || e.keyCode === 229) {
        return;
      }

      if (isUndo) {
        const temporalApi = getTemporalState();
        if (temporalApi.pastStates.length > 0) {
          e.preventDefault();
          temporalApi.undo();
        }
      }

      if (isRedo) {
        const temporalApi = getTemporalState();
        if (temporalApi.futureStates.length > 0) {
          e.preventDefault();
          temporalApi.redo();
        }
      }

      if (isCollapseAll || isExpandAll) {
        const nextCollapsed = isCollapseAll;
        const hasChanges = Object.values(useTaskStore.getState().tasks).some(
          (task) => task.children.length > 0 && task.isCollapsed !== nextCollapsed
        );

        if (hasChanges) {
          e.preventDefault();
          useTaskStore.getState().setAllCollapsed(nextCollapsed);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  useEffect(() => {
    setHoveredTaskId(null);
  }, [view]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setIsProjectMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 w-screen overflow-hidden">
      {/* Header / Tabs */}
      <header className="h-10 bg-gray-100 flex items-center px-4 border-b border-gray-300 select-none draggable">
        <div className="flex space-x-1 no-drag items-center">
          <div className="relative" ref={projectMenuRef}>
            <button
              onClick={() => setIsProjectMenuOpen((open) => !open)}
              className={clsx(
                'flex items-center gap-1 px-3 py-1 text-xs rounded-sm transition-colors no-drag',
                isProjectMenuOpen ? 'bg-white text-blue-600 shadow-sm font-medium' : 'text-gray-600 hover:bg-gray-200'
              )}
            >
              Project
              <ChevronDown size={12} />
            </button>

            {isProjectMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-60 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg z-50">
                <button
                  onClick={() => {
                    setIsProjectSettingsOpen(true);
                    setIsProjectMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <CalendarDays size={14} className="text-blue-500" />
                  <span className="flex-1">Holiday Settings</span>
                  <span className="text-[10px] text-gray-400">
                    {projectConfig.calendar.holidays.length}
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="w-px bg-gray-300 mx-1 h-4 my-auto" />

          <button
            onClick={() => setView('wbs')}
            className={clsx(
              "px-3 py-1 text-xs rounded-sm transition-colors",
              view === 'wbs' ? "bg-white text-blue-600 shadow-sm font-medium" : "text-gray-500 hover:bg-gray-200"
            )}
          >
            WBS
          </button>
          <button
            onClick={() => setView('integrated')}
            className={clsx(
              "px-3 py-1 text-xs rounded-sm transition-colors",
              view === 'integrated' ? "bg-white text-blue-600 shadow-sm font-medium" : "text-gray-500 hover:bg-gray-200"
            )}
          >
            Integrated
          </button>
          <button
            onClick={() => setView('gantt')}
            className={clsx(
              "px-3 py-1 text-xs rounded-sm transition-colors",
              view === 'gantt' ? "bg-white text-blue-600 shadow-sm font-medium" : "text-gray-500 hover:bg-gray-200"
            )}
          >
            Gantt
          </button>

          <div className="w-px bg-gray-300 mx-2 h-4 my-auto" />

          <button
            onClick={() => undo?.()}
            disabled={!canUndo}
            className="p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded-sm no-drag"
            title="Undo (Cmd+Z)"
          >
            <Undo size={14} />
          </button>
          <button
            onClick={() => redo?.()}
            disabled={!canRedo}
            className="p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded-sm no-drag"
            title="Redo (Cmd+Y or Cmd+Shift+Z)"
          >
            <Redo size={14} />
          </button>

          <div className="w-px bg-gray-300 mx-2 h-4 my-auto" />

          <button
            onClick={() => setAllCollapsed(false)}
            disabled={!canExpandAll}
            className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded-sm no-drag"
            title="Expand All (Cmd/Ctrl+Alt+ArrowDown)"
          >
            Expand All
          </button>
          <button
            onClick={() => setAllCollapsed(true)}
            disabled={!canCollapseAll}
            className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent rounded-sm no-drag"
            title="Collapse All (Cmd/Ctrl+Alt+ArrowUp)"
          >
            Collapse All
          </button>

          <div className="w-px bg-gray-300 mx-2 h-4 my-auto" />

          <button onClick={handleSave} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Save</button>
          <button onClick={handleLoad} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Load</button>
          <button onClick={handleExport} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Export</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {view === 'wbs' && (
          <div className="flex-1 overflow-auto min-h-0 min-w-0">
            <Outliner
              showDetails={true}
              flattenedItems={visibleItems}
              hoveredTaskId={hoveredTaskId}
              onHoverTaskChange={setHoveredTaskId}
            />
          </div>
        )}

        {view === 'integrated' && (
          <IntegratedView
            outlinerWidth={outlinerWidth}
            onResizeStart={startResizing}
            flattenedItems={visibleItems}
            hoveredTaskId={hoveredTaskId}
            onHoverTaskChange={setHoveredTaskId}
          />
        )}

        {view === 'gantt' && (
          <div className="flex-1 relative overflow-hidden w-full min-h-0 min-w-0">
            <GanttChart
              showSidebar
              showNames
              flattenedItems={visibleItems}
              hoveredTaskId={hoveredTaskId}
              onHoverTaskChange={setHoveredTaskId}
            />
          </div>
        )}
      </main>

      {/* Status Bar */}
      <footer className="h-6 bg-gray-100 border-t border-gray-300 flex items-center px-2 text-[10px] text-gray-500 select-none">
        <span>Ready</span>
      </footer>

      <ProjectSettingsDialog
        isOpen={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
