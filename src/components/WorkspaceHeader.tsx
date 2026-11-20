import { Atom, AudioWaveform, Boxes, Crosshair, Files } from 'lucide-react';
import type { ReactNode } from 'react';
import './workspace-header.css';

export type Workspace = 'machine' | 'senoo' | 'clock' | 'evidence';

const destinations = [
  { id: 'machine', label: '整机演示', icon: Boxes },
  { id: 'senoo', label: 'Senoo 装置', icon: Crosshair },
  { id: 'clock', label: '钟跃迁子系统', icon: AudioWaveform },
  { id: 'evidence', label: '整机证据', icon: Files },
] as const;

export function WorkspaceHeader({ current, children }: { current: Workspace; children?: ReactNode }) {
  return <header className="ws-header">
    <div className="ws-header-inner">
      <a href="#machine" className="ws-brand"><Atom size={25} aria-hidden="true" /><span>NAQC 数字孪生</span></a>
      <nav aria-label="工作区导航" className="ws-nav">
        {destinations.map(({ id, label, icon: Icon }) =>
          <a href={`#${id}`} key={id} aria-current={current === id ? 'page' : undefined}
            aria-label={current === 'clock' && id === 'machine' ? '返回整机演示' : undefined}>
            <Icon size={16} aria-hidden="true" />{label}
          </a>)}
      </nav>
      {children && <div className="ws-actions">{children}</div>}
    </div>
  </header>;
}
