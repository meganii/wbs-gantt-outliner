import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log('Renderer process started');

window.onerror = function(message, source, lineno, colno, error) {
  const errDiv = document.createElement('div');
  errDiv.style.position = 'fixed';
  errDiv.style.top = '0';
  errDiv.style.left = '0';
  errDiv.style.width = '100%';
  errDiv.style.backgroundColor = 'red';
  errDiv.style.color = 'white';
  errDiv.style.zIndex = '9999';
  errDiv.style.padding = '20px';
  errDiv.innerText = `Error: ${message}\nSource: ${source}:${lineno}`;
  document.body.appendChild(errDiv);
};

try {
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');
  
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e) {
  console.error(e);
  document.body.innerHTML = `<div style="color:red; font-size: 20px;">Render Error: ${e}</div>`;
}
