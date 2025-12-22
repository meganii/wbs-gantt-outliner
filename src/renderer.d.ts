export interface IpcRenderer {
  send(channel: string, ...args: any[]): void;
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void): () => void;
}

declare global {
  interface Window {
    ipcRenderer: IpcRenderer;
  }
}
