import { useState } from 'react';
import { Outliner } from './components/Outliner';
import { GanttChart } from './components/GanttChart';
import clsx from 'clsx';
import { useTaskStore } from './store/useTaskStore';

function App() {
  const [view, setView] = useState<'outliner' | 'gantt'>('outliner');
  
  const tasks = useTaskStore(state => state.tasks);
  const rootIds = useTaskStore(state => state.rootIds);
  const projectConfig = useTaskStore(state => state.projectConfig);

  const loadProject = (data: any) => {
    useTaskStore.setState({ 
      tasks: data.tasks, 
      rootIds: data.rootIds, 
      projectConfig: data.projectConfig 
    });
  };

  const handleSave = async () => {
    const data = JSON.stringify({ tasks, rootIds, projectConfig }, null, 2);
    // @ts-ignore
    await window.ipcRenderer.invoke('save-file', data);
  };

  const handleLoad = async () => {
    // @ts-ignore
    const content = await window.ipcRenderer.invoke('load-file');
    if (content) {
      try {
        const data = JSON.parse(content);
        loadProject(data);
      } catch (e) {
        console.error('Failed to parse project file', e);
      }
    }
  };

  const handleExport = async () => {
     const { exportToExcel } = await import('./utils/export');
     exportToExcel(tasks, rootIds);
  };

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900">
      {/* Header / Tabs */}
      <header className="h-10 bg-gray-100 flex items-center px-4 border-b border-gray-300 select-none draggable">
        <span className="font-bold text-gray-700 text-sm mr-6">WBS Gantt Outliner</span>
        
        <div className="flex space-x-1 no-drag">
          <button 
            onClick={() => setView('outliner')}
            className={clsx(
              "px-3 py-1 text-xs rounded-sm transition-colors",
              view === 'outliner' ? "bg-white text-blue-600 shadow-sm font-medium" : "text-gray-500 hover:bg-gray-200"
            )}
          >
            Outliner
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
          
          <button onClick={handleSave} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Save</button>
          <button onClick={handleLoad} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Load</button>
          <button onClick={handleExport} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-sm no-drag">Export</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {view === 'outliner' ? <Outliner /> : <GanttChart />}
      </main>
      
      {/* Status Bar */}
      <footer className="h-6 bg-gray-100 border-t border-gray-300 flex items-center px-2 text-[10px] text-gray-500 select-none">
        <span>Ready</span>
      </footer>
    </div>
  );
}

export default App;
