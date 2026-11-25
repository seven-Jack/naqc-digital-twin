import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '../../../src/styles.css';
import { SenooApparatus } from '../../../src/machine/SenooApparatus';
import { SenooReadoutSource } from '../../../src/machine/SenooReadoutSource';
import { SenooPopulationSource } from '../../../src/machine/SenooPopulationSource';
import { TwinEvidenceWorkspace } from '../../../src/machine/TwinEvidenceWorkspace';
import { useHashFragment } from '../../../src/state/useHashFragment';

function ResearchFixture() {
  const hash = useHashFragment();
  if (hash.startsWith('#evidence')) return <TwinEvidenceWorkspace />;
  if (hash === '#sources') return <main className="md-app md-main"><SenooReadoutSource /><SenooPopulationSource /></main>;
  return <SenooApparatus />;
}

createRoot(document.getElementById('root')!).render(<ResearchFixture />);
