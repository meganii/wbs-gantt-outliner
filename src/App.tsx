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

  const loadProject = useTaskStore(_ => (data: any) => {
    useTaskStore.setState({ 
      tasks: data.tasks, 
      rootIds: data.rootIds, 
      projectConfig: data.projectConfig 
    });
  });

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
    <div className="flex flex-col h-screen bg-[#1e1e1e]">
      {/* Header / Tabs */}
      <header className="h-10 bg-[#2b2b2b] flex items-center px-4 border-b border-black select-none draggable">
        <span className="font-bold text-gray-300 text-sm mr-6">WBS Gantt Outliner</span>
        
        <div className="flex space-x-1 no-drag">
          <button 
            onClick={() => setView('outliner')}
            className={clsx(
              "px-3 py-1 text-xs rounded-sm transition-colors",
              view === 'outliner' ? "bg-[#3c3c3c] text-white" : "text-gray-400 hover:bg-[#323232]"
            )}
          >
            Outliner
          </button>
          <button 
            onClick={() => setView('gantt')}
            className={clsx(
              "px-3 py-1 text-xs rounded-sm transition-colors",
              view === 'gantt' ? "bg-[#3c3c3c] text-white" : "text-gray-400 hover:bg-[#323232]"
            )}
          >
            Gantt
          </button>
          
          <div className="w-px bg-gray-700 mx-2 h-4 my-auto" />
          
          <button onClick={handleSave} className="px-3 py-1 text-xs text-gray-400 hover:bg-[#323232] rounded-sm no-drag">Save</button>
          <button onClick={handleLoad} className="px-3 py-1 text-xs text-gray-400 hover:bg-[#323232] rounded-sm no-drag">Load</button>
          <button onClick={handleExport} className="px-3 py-1 text-xs text-gray-400 hover:bg-[#323232] rounded-sm no-drag">Export</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {view === 'outliner' ? <Outliner /> : <GanttChart />}
      </main>
      
      {/* Status Bar */}
      <footer className="h-6 bg-[#2b2b2b] border-t border-black flex items-center px-2 text-[10px] text-gray-500 select-none">
        <span>Ready</span>
      </footer>
    </div>
  );
}

export default App;
