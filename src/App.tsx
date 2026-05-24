import { useState, useEffect, useMemo } from 'react';
import { Outliner } from './components/Outliner';
import { GanttChart } from './components/GanttChart';
import { IntegratedView } from './components/IntegratedView';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
import { AppHeader } from './components/AppHeader';
import { useTaskStore } from './store/useTaskStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useIpcSwitchView } from './hooks/useIpcSwitchView';
import { useOutlinerResize } from './hooks/useOutlinerResize';
import { flattenTree } from './utils/tree';

function App() {
  const [view, setView] = useState<'wbs' | 'integrated' | 'gantt'>('integrated');
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);

  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);
  const projectConfig = useTaskStore((state) => state.projectConfig);
  const visibleItems = useMemo(() => flattenTree(tasks, rootIds), [tasks, rootIds]);

  const { outlinerWidth, startResizing } = useOutlinerResize({
    columnWidths: projectConfig.columnWidths,
  });

  // Keyboard Shortcuts for Undo/Redo & View Switches
  useKeyboardShortcuts({ setView });
  // IPC View Switch (Electron)
  useIpcSwitchView(setView);

  // View 切り替え時に hover 状態をリセット
  useEffect(() => {
    setHoveredTaskId(null);
  }, [view]);

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 w-screen overflow-hidden">
      <AppHeader
        view={view}
        setView={setView}
        onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
      />

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
