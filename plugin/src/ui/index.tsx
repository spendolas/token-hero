import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PluginProvider } from './state/PluginContext';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary>
    <PluginProvider>
      <App />
    </PluginProvider>
  </ErrorBoundary>,
);
