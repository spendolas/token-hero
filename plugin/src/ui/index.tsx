import { createRoot } from 'react-dom/client';
import { PluginProvider } from './state/PluginContext';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <PluginProvider>
    <App />
  </PluginProvider>,
);
