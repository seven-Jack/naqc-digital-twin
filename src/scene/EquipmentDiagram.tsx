import type { ReactNode } from 'react';
import { machineEquipment, type EquipmentId } from '../data/machineEquipment';
import type { MachineSceneFrame } from './machineSceneFrame';
import './equipment-diagram.css';

interface Props {
  id: EquipmentId;
  split: number;
  selected: string | null;
  illuminated?: string | null;
  onSelect: (part: string | null) => void;
  atoms: MachineSceneFrame['atoms'];
  geometryRecorded?: boolean;
  supplyProgress?: number;
  slmPowers?: Pick<MachineSceneFrame['strengths'], 'reservoir' | 'science'>;
  rows: number;
  columns: number;
}

interface Layer {
  id: string;
  dx: number;
  dy: number;
  shapes: ReactNode;
}

function layer(id: string, dx: number, dy: number, shapes: ReactNode): Layer {
  return { id, dx, dy, shapes };
}

function LaserHead({ y, color }: { y: number; color: string }) {
  return <g transform={`translate(0 ${y})`}>
    <path d="M168 0L178 -5L204 -2L194 4ZM168 0L194 4V17L168 13ZM194 4L204 -2V11L194 17Z" />
    <path d="M142 2L172 5V12L142 9Z" /><ellipse cx="142" cy="5.5" rx="3" ry="5" fill={color} />
    <path d="M149 2V10M154 3V11M197 5L217 8V12L197 10Z" />
    <path className="eqd-engrave" d="M217 10Q235 10 240 20" />
  </g>;
}

// Each path is drawn in its assembled position. Only its named parent is translated.
const drawings: Record<Exclude<EquipmentId, 'array'>, Layer[]> = {
  table: [
    layer('feet', 0, 27, <path d="M81 130L97 135V151L81 146ZM225 136L240 132V147L225 151ZM257 106L272 103V116L257 120ZM106 102L119 99V111L106 115Z" />),
    layer('frame', 0, 0, <><path d="M64 106L150 75L288 100L203 134ZM64 106L203 134V150L64 122ZM203 134L288 100V116L203 150Z" /><path className="eqd-engrave" d="M72 117L196 142M210 140L279 113" /></>),
    layer('surface', 0, -31, <><path d="M60 102L149 69L292 95L203 130ZM60 102L203 130V134L60 107ZM203 130L292 95V99L203 134Z" />
      {Array.from({ length: 72 }, (_, i) => {
        const col = i % 12, row = Math.floor(i / 12);
        return <ellipse key={i} cx={145 + col * 10.5 - row * 12.6} cy={76 + col * 1.91 + row * 4.68} rx="1.35" ry=".76" className="eqd-inset" />;
      })}</>),
  ],
  source: [
    layer('mount', 0, 24, <><path d="M98 148H216L230 140H112ZM104 147V135H112V147ZM194 145V132H202V145Z" /></>),
    layer('body', -18, 3, <><path d="M88 113H128V131H88Z M128 119H180V125H128Z" />
      <ellipse cx="89" cy="122" rx="5" ry="10" /><path d="M180 109L193 103H211L223 113V131L211 138H190L180 131Z"/>
      <ellipse cx="201" cy="121" rx="12" ry="11" className="eqd-glass" /></>),
    layer('nozzle', 18, -18, <><path d="M195 103V53H207V103Z" /><ellipse cx="201" cy="103" rx="14" ry="4" />
      <ellipse cx="201" cy="53" rx="13" ry="4" /><ellipse className="eqd-port" cx="201" cy="52" rx="6" ry="2" /></>),
  ],
  slm: [
    layer('modulator', -22, 5, <><path d="M70 85L100 70L177 81L145 96ZM70 85L145 96V144L70 133ZM145 96L177 81V130L145 144Z" />
      <path className="eqd-inset" d="M79 98L132 106V127L79 119Z" /><path className="eqd-engrave" d="M84 104L127 111M84 110L127 117M96 102V120M108 104V122M119 106V124" /></>),
    layer('relay', 22, -22, <><path d="M229 145L257 134L269 138L241 151ZM242 140V111H249V138Z" />
      <path d="M235 83L256 75L268 105L247 113Z" /><path className="eqd-glass" d="M240 86L254 81L262 102L249 108Z" />
      <path d="M225 83L246 75L258 105L237 113Z" /><path className="eqd-glass" d="M230 86L244 81L252 102L239 108Z" /></>),
    layer('ports', 17, 22, <><path d="M157 100L173 104V112L157 108ZM169 91L185 95V103L169 99Z" />
      <ellipse cx="173" cy="108" rx="3" ry="4.5" fill="#71d9a9" /><ellipse cx="185" cy="99" rx="3" ry="4.5" fill="#80a8fa" /></>),
  ],
  aod: [
    layer('mount', -2, 33, <><path d="M144 132V111H153V132ZM205 132V110H213V132Z" /><path d="M125 134L155 126L232 133L200 143ZM125 134L200 143V149L125 141ZM200 143L232 133V139L200 149Z" /></>),
    layer('deflector', -23, -16, <><path d="M115 86L138 76L167 79L144 90ZM115 86L144 90V113L115 109ZM144 90L167 79V102L144 113Z" />
      <path d="M164 90L186 80L214 83L192 94ZM164 90L192 94V118L164 114ZM192 94L214 83V107L192 118Z" />
      <path className="eqd-engrave" d="M121 97L138 99M177 95V110" /></>),
    layer('port', 41, -4, <><path d="M197 92L214 95V109L197 106ZM213 97L230 99V108L213 106Z" />
      <ellipse cx="230" cy="103.5" rx="3.8" ry="5.5" className="eqd-glass" /></>),
  ],
  vacuum: [
    layer('objective', 20, -20, <><path d="M174 103L198 80L207 88L183 111Z M195 80L207 69L218 80L207 91Z" /><ellipse className="eqd-glass" cx="179" cy="107" rx="8" ry="4" transform="rotate(42 179 107)"/></>),
    layer('pump', 39, -6, <><path d="M176 99L204 85L211 97L182 111ZM203 79L217 72L232 77L218 87ZM204 80L218 87V101L204 95ZM218 87L232 77V92L218 101Z" />
      <path d="M221 93L250 99V111L221 104Z" /><ellipse cx="249" cy="105" rx="5" ry="10" /><ellipse className="eqd-inset" cx="250" cy="105" rx="2.5" ry="6" /></>),
    layer('chamber', -12, -26, <><path className="eqd-glass" fillOpacity=".35" d="M127 86L155 69L217 81L189 99ZM127 86L189 99V130L127 117ZM189 99L217 81V113L189 130Z" />
      {[128, 207].map((x, i) => <g key={x} transform={`translate(${x} ${i ? 97 : 101}) rotate(10)`}>
        <path fillRule="evenodd" fill="#a47957" d="M0 -25A12 25 0 1 1 0 25A12 25 0 1 1 0 -25ZM0 -18A8 18 0 1 0 0 18A8 18 0 1 0 0 -18Z" />
      </g>)}</>),
  ],
  gate: [
    layer('mount', 1, 30, <><path d="M137 140L162 127L248 136L223 151ZM137 140L223 151V157L137 147ZM223 151L248 136V143L223 157Z" /><path d="M166 130V94H175V132ZM219 135V93H227V135Z" /></>),
    layer('clock', 23, -31, <LaserHead y={77} color="#ffcc7e" />),
    layer('rydberg', -37, -6, <LaserHead y={96} color="#b089fc" />),
    layer('probe', 25, 15, <LaserHead y={115} color="#94e3a7" />),
  ],
  imaging: [
    layer('mount', 0, 26, <><path d="M148 143H224L238 136H162ZM170 139V99H180V139ZM210 138V99H220V138Z" /></>),
    layer('objective', -26, 0, <><path d="M135 85H158V79H180V106H158V101H135Z" />
      <ellipse className="eqd-glass" cx="135" cy="93" rx="4" ry="8" /></>),
    layer('camera', 25, -9, <><path d="M180 79L193 71H228L217 79ZM180 79H217V106H180ZM217 79L228 71V98L217 106Z" />
      <path className="eqd-engrave" d="M185 84V100M191 84V100M197 84V100"/><circle cx="208" cy="90" r="2" fill="#f6bc8c"/></>),
  ],
};

function arrayLayers(rows: number, columns: number, atoms: Props['atoms']): Layer[] {
  const pitch = Math.min(147 / columns, 90 / rows);
  const x = (column: number, row: number) => 180 + pitch * ((column - (columns - 1) / 2) * 1.08 - (row - (rows - 1) / 2) * .68);
  const y = (column: number, row: number) => 105 + pitch * ((column - (columns - 1) / 2) * .30 + (row - (rows - 1) / 2) * .52);
  const corners = [[-.5, -.5], [columns - .5, -.5], [columns - .5, rows - .5], [-.5, rows - .5]];
  const outline = corners.map(([c, r]) => `${x(c, r)},${y(c, r)}`).join(' ');
  return [
    layer('plane', 0, 26, <polygon points={outline} />),
    layer('sites', 0, 0, Array.from({ length: rows * columns }, (_, index) => {
      const c = index % columns, r = Math.floor(index / columns);
      return <ellipse key={index} className="eqd-site" cx={x(c, r)} cy={y(c, r)} rx={pitch * .32} ry={pitch * .18} />;
    })),
    layer('atoms', 0, -34, atoms.map(atom => <circle key={atom.id} data-atom-id={atom.id} cx={x(atom.column, atom.row)} cy={y(atom.column, atom.row)}
      r={pitch * .21} fill={atom.bright === true ? '#ffc081' : atom.bright === false ? '#72859e' : atom.qubit !== undefined ? '#b49dff' : '#72e1c0'} />)),
  ];
}

// Fit the full travel of each drawing to the viewport without changing scale as the slider moves.
const diagramBounds: Record<EquipmentId, readonly [number, number, number, number]> = {
  table: [49, 18, 258, 182], source: [58, 18, 213, 162], slm: [39, 29, 264, 155],
  aod: [80, 33, 215, 163], vacuum: [98, 18, 210, 180], array: [48, 15, 264, 182],
  gate: [88, 18, 203, 180], imaging: [95, 26, 176, 153],
};

export function EquipmentDiagram({ id, split, selected, illuminated, onSelect, atoms, rows, columns, geometryRecorded = true, slmPowers, supplyProgress }: Props) {
  const item = machineEquipment[id];
  const layers = id === 'array' ? arrayLayers(rows, columns, geometryRecorded ? atoms : []) : drawings[id];
  const amount = split / 100;
  const [left, top, width, height] = diagramBounds[id];
  return <svg className="equipment-diagram" viewBox={diagramBounds[id].join(' ')} role="group"
    aria-label={`${item.label}，二维结构示意`} data-testid="equipment-diagram">
    <title>{item.label} · 二维结构示意</title>
    <text className="eqd-caption" x={left + 4} y={top + 12}>二维结构示意</text>
    {id === 'slm' && slmPowers && (['reservoir', 'science'] as const).map(channel => {
      const ports = layers.find(part => part.id === 'ports')!;
      const relay = layers.find(part => part.id === 'relay')!;
      const reservoir = channel === 'reservoir';
      return <line key={channel} pointerEvents="none" stroke={reservoir ? '#71d9a9' : '#80a8fa'} strokeWidth="2.5"
        opacity={slmPowers[channel]} x1={(reservoir ? 173 : 185) + ports.dx * amount}
        y1={(reservoir ? 108 : 99) + ports.dy * amount} x2={242 + relay.dx * amount} y2={95 + relay.dy * amount} />;
    })}
    {layers.map(({ id: partId, dx, dy, shapes }) => {
      const part = item.parts.find(part => part.id === partId)!;
      const active = selected === partId;
      const choose = () => onSelect(active ? null : partId);
      return <g key={partId} transform={`translate(${dx * amount} ${dy * amount})`} role="button"
        tabIndex={0} aria-label={part.label} aria-pressed={active} className="eqd-part" data-diagram-part={partId}
        data-illuminated={(!selected && partId === illuminated) || undefined}
        onClick={choose} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
        }}>
        <title>{part.label}</title>{shapes}
      </g>;
    })}
    {id === 'source' && supplyProgress !== undefined && (() => {
      const mot = layers.find(part => part.id === 'body')!;
      const tube = layers.find(part => part.id === 'nozzle')!;
      const dx = mot.dx * (1 - supplyProgress) + tube.dx * supplyProgress;
      const dy = mot.dy * (1 - supplyProgress) + tube.dy * supplyProgress;
      return <circle data-testid="cold-sample" cx={201 + dx * amount} cy={121 - 78 * supplyProgress + dy * amount}
        r="3" fill="#9ee8c9" pointerEvents="none" />;
    })()}
    {id === 'array' && (!geometryRecorded || !atoms.length) && <text className="eqd-caption" x={left + width - 4} y={top + height - 4} textAnchor="end">
      {geometryRecorded ? '本帧无原子' : '本帧坐标缺测'}
    </text>}
  </svg>;
}
