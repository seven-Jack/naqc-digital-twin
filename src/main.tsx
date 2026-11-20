import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { WorkspaceHeader, type Workspace } from './components/WorkspaceHeader';
import { useHashFragment } from './state/useHashFragment';
import type { MachineWorkspaceSession } from './machine/MachineDashboard';
import './styles.css';

const Clock = lazy(() => import('./App').then(module => ({ default: module.App })));
const Machine = lazy(() => import('./machine/MachineDashboard').then(module => ({ default: module.MachineDashboard })));
const Senoo = lazy(() => import('./machine/SenooApparatus').then(module => ({ default: module.SenooApparatus })));
const Evidence = lazy(() => import('./machine/TwinEvidenceWorkspace').then(module => ({ default: module.TwinEvidenceWorkspace })));

const titles: Record<Workspace, string> = {
  machine: '中性原子量子计算机整机数字孪生',
  clock: '¹⁷¹Yb 钟跃迁数字孪生',
  senoo: 'Senoo ¹⁷¹Yb 装置回放',
  evidence: '整机证据 · 中性原子数字孪生',
};
const clockAnchors = new Set(['optical-controls', 'research-models']);
const machineAnchors = new Set(['machine/config', 'machine/scene', 'machine/results']);

function currentView(fragment: string): Workspace {
  const [route] = fragment.split(/[/?]/);
  if (route === 'machine' || route === 'senoo' || route === 'clock' || route === 'evidence') return route;
  if (clockAnchors.has(fragment) || new URLSearchParams(location.search).get('demo') === 'compensation') return 'clock';
  return 'machine';
}

function RouteFocus({ view, fragment }: { view: Workspace; fragment: string }) {
  const previous = useRef<Workspace>(view);
  useLayoutEffect(() => {
    const section = (machineAnchors.has(fragment) || clockAnchors.has(fragment))
      ? document.getElementById(fragment) : null;
    if (section) {
      if (!section.hasAttribute('tabindex')) section.tabIndex = -1;
      section.focus({ preventScroll: true });
      section.scrollIntoView({ block: 'start' });
    } else if (previous.current !== view || fragment === view || fragment === '') {
      if (previous.current !== view) {
        const heading = document.querySelector<HTMLElement>('main h1');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
      window.scrollTo(0, 0);
    }
    previous.current = view;
  }, [view, fragment]);
  return null;
}

function DigitalTwin() {
  const fragment = useHashFragment().slice(1);
  const machineSession = useRef<MachineWorkspaceSession | null>(null);
  const view = currentView(fragment);
  useEffect(() => { document.title = titles[view]; }, [view]);

  return <Suspense fallback={<p className="twin-loading" role="status">正在加载数字孪生…</p>}>
    {view === 'clock' && <Clock />}
    {view === 'machine' && <Machine session={machineSession} />}
    {view === 'senoo' && <Senoo />}
    {view === 'evidence' && <><WorkspaceHeader current="evidence" /><Evidence /></>}
    <RouteFocus view={view} fragment={fragment} />
  </Suspense>;
}

createRoot(document.getElementById('root')!).render(<DigitalTwin />);
