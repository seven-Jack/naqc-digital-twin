import { ChevronDown } from 'lucide-react';

const speeds = Array.from({ length: 20 }, (_, index) => (index + 1) / 10);

export function PlaybackSpeed({ value, onChange, label = '播放速度' }: {
  value: number; onChange: (speed: number) => void; label?: string;
}) {
  return <label className="md-speed">
    <select aria-label={label} title={label} value={value} onChange={event => onChange(Number(event.currentTarget.value))}>
      {speeds.map(speed => <option key={speed} value={speed}>{speed}×</option>)}
    </select><ChevronDown size={12} aria-hidden="true" />
  </label>;
}
