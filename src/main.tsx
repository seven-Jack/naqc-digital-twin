import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import { MachineDashboard } from './machine/MachineDashboard';

function MachineSite() {
  useLayoutEffect(() => {
    function restoreMachineLink() {
      const url = new URL(window.location.href);
      const retiredPage = /^#(?:clock|optical-controls|research-models|senoo|evidence)(?:[/?]|$)/.test(url.hash);
      const compensationDemo = url.searchParams.get('demo') === 'compensation';
      if (!retiredPage && !compensationDemo) return;
      if (compensationDemo) url.searchParams.delete('demo');
      if (retiredPage || !url.hash) url.hash = 'machine';
      history.replaceState(history.state, '', url);
      if (url.hash === '#machine') document.getElementById('machine')?.focus();
    }

    restoreMachineLink();
    // On a direct visit the browser can resolve the fragment before React mounts its target.
    const target = document.getElementById(location.hash.slice(1));
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    }
    window.addEventListener('hashchange', restoreMachineLink);
    return () => window.removeEventListener('hashchange', restoreMachineLink);
  }, []);

  return <MachineDashboard />;
}

createRoot(document.getElementById('root')!).render(<MachineSite />);
