import { useRef, useCallback, useState, useEffect } from 'react';
import { useStore } from 'zustand';
import { Outliner } from './components/Outliner';
import { GanttChart } from './components/GanttChart';
import { getTemporalState, loadProjectState, useTaskStore } from './store/useTaskStore';
import clsx from 'clsx';
import { Undo, Redo } from 'lucide-react';

function App() {
  const [view, setView] = useState<'wbs' | 'integrated' | 'gantt'>('integrated');

  const tasks = useTaskStore(state => state.tasks);
  const rootIds = useTaskStore(state => state.rootIds);
  const projectConfig = useTaskStore(state => state.projectConfig);

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
      setOutlinerWidth(e.clientX);
    }
  }, [isResizing]);

  const outlinerScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback((source: React.RefObject<HTMLDivElement | null>, target: React.RefObject<HTMLDivElement | null>) => {
    if (source.current && target.current) {
      target.current.scrollTop = source.current.scrollTop;
    }
  }, []);

  const handleOutlinerScroll = useCallback(() => {
    syncScroll(outlinerScrollRef, ganttScrollRef);
  }, [syncScroll]);

  const handleGanttScroll = useCallback(() => {
    syncScroll(ganttScrollRef, outlinerScrollRef);
  }, [syncScroll]);

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

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 w-screen overflow-hidden">
      {/* Header / Tabs */}
      <header className="h-10 bg-gray-100 flex items-center px-4 border-b border-gray-300 select-none draggable">
        <div className="flex space-x-1 no-drag items-center">
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

          <button onClick={handleSave} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Save</button>
          <button onClick={handleLoad} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Load</button>
          <button onClick={handleExport} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Export</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {view === 'wbs' && (
          <div className="flex-1 overflow-auto">
            <Outliner />
          </div>
        )}

        {view === 'integrated' && (
          <>
            <div
              ref={outlinerScrollRef}
              onScroll={handleOutlinerScroll}
              style={{ width: outlinerWidth }}
              className="border-r border-gray-200 overflow-y-auto no-scrollbar flex-shrink-0"
            >
              <Outliner />
            </div>
            {/* Resize Handle */}
            <div
              className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors z-50 flex-shrink-0"
              onMouseDown={startResizing}
            />
            <div className="flex-1 relative overflow-hidden">
              <GanttChart
                showSidebar
                scrollRef={ganttScrollRef}
                onScroll={handleGanttScroll}
              />
            </div>
          </>
        )}

        {view === 'gantt' && (
          <div className="flex-1 relative overflow-hidden w-full">
            <GanttChart showSidebar showNames />
          </div>
        )}
      </main>

      {/* Status Bar */}
      <footer className="h-6 bg-gray-100 border-t border-gray-300 flex items-center px-2 text-[10px] text-gray-500 select-none">
        <span>Ready</span>
      </footer>
    </div>
  );
}

export default App;
