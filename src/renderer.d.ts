export interface IpcRenderer {
  send(channel: string, ...args: unknown[]): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    ipcRenderer: IpcRenderer;
  }
}
