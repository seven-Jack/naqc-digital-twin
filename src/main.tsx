import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';

const Clock = lazy(() => import('./App').then(module => ({ default: module.App })));
const Machine = lazy(() => import('./machine/MachineDashboard').then(module => ({ default: module.MachineDashboard })));
const clockTitle = '¹⁷¹Yb 钟跃迁数字孪生';
const machineTitle = '中性原子量子计算机整机数字孪生';

function currentView() {
  if (window.location.hash === '#machine') return 'machine';
  if (window.location.hash === '#clock' || new URLSearchParams(window.location.search).get('demo') === 'compensation') return 'clock';
  return 'machine';
}

function DigitalTwin() {
  const [view, setView] = useState(currentView);
  useEffect(() => {
    const onNavigate = () => setView(currentView());
    window.addEventListener('hashchange', onNavigate);
    return () => window.removeEventListener('hashchange', onNavigate);
  }, []);
  useEffect(() => {
    document.title = view === 'clock' ? clockTitle : machineTitle;
    window.scrollTo(0, 0);
  }, [view]);

  return <Suspense fallback={<p className="twin-loading" role="status">正在加载数字孪生…</p>}>
    {view === 'clock' ? <Clock /> : <Machine />}
  </Suspense>;
}

createRoot(document.getElementById('root')!).render(<DigitalTwin />);
