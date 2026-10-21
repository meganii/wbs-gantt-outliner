import { useState, useMemo } from 'react';
import { Outliner } from './components/Outliner';
import { GanttChart } from './components/GanttChart';
import { IntegratedView } from './components/IntegratedView';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
import { AppHeader } from './components/AppHeader';
import { SubToolbar } from './components/SubToolbar';
import { StatusBar } from './components/StatusBar';
import { ToastContainer } from './components/ToastContainer';
import { useTaskStore } from './store/useTaskStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useOutlinerResize } from './hooks/useOutlinerResize';
import { flattenTree } from './utils/tree';
import { COMPACT_COLUMNS } from './utils/projectConfig';

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
    minWidth: useMemo(
      () =>
        (projectConfig.integratedColumns ?? COMPACT_COLUMNS).reduce(
          (sum, columnId) => sum + projectConfig.columnWidths[columnId],
          0
        ),
      [projectConfig.integratedColumns, projectConfig.columnWidths]
    ),
  });

  // Keyboard Shortcuts for Undo/Redo & View Switches
  useKeyboardShortcuts({ setView });

  // View 切り替え時に hover 状態をリセット
  // (effect 内での setState を避け、レンダー中に state を調整する)
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setHoveredTaskId(null);
  }

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 w-screen overflow-hidden">
      <AppHeader
        view={view}
        setView={setView}
        onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
      />

      <SubToolbar view={view} />

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
              showNames
              flattenedItems={visibleItems}
              hoveredTaskId={hoveredTaskId}
              onHoverTaskChange={setHoveredTaskId}
            />
          </div>
        )}
      </main>

      {/* Status Bar */}
      <StatusBar view={view} />

      <ProjectSettingsDialog
        isOpen={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
      />

      <ToastContainer />
    </div>
  );
}

export default App;
