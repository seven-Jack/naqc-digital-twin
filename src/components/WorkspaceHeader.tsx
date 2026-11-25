import { Atom } from 'lucide-react';
import type { ReactNode } from 'react';
import { useHashFragment } from '../state/useHashFragment';
import './workspace-header.css';

const sections = [
  { href: '#machine/scene', label: '整机架构' },
  { href: '#machine/gates', label: '门操作' },
  { href: '#machine/config', label: '运行配置' },
  { href: '#machine/results', label: '批次读出' },
];

export function WorkspaceHeader({ children }: { children: ReactNode }) {
  const hash = useHashFragment();
  const current = ['', '#machine'].includes(hash) || hash.startsWith('#machine/equipment/') ? '#machine/scene' : hash;
  return <header id="machine" tabIndex={-1} className="ws-header">
    <div className="ws-header-inner">
      <a href="#machine" className="ws-brand"><Atom size={25} aria-hidden="true" /><span>NAQC 数字孪生</span></a>
      <nav aria-label="整机导航" className="ws-nav">
        {sections.map(({ href, label }) => <a key={href} href={href} aria-current={current === href ? 'location' : undefined}>{label}</a>)}
      </nav>
      <div className="ws-actions">{children}</div>
    </div>
  </header>;
}
