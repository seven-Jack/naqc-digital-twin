import type { ReactNode } from 'react';
import { machineEquipment, type EquipmentId } from '../data/machineEquipment';
import type { MachineSceneFrame } from './machineSceneFrame';
import './equipment-diagram.css';

interface Props {
  id: EquipmentId;
  split: number;
  selected: string | null;
  onSelect: (part: string | null) => void;
  atoms: MachineSceneFrame['atoms'];
  geometryRecorded?: boolean;
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
    <path d="M151 0H231L248 -7H168ZM151 0H231V15H151ZM231 0L248 -7V8L231 15Z" />
    <path d="M151 4H138V11H151Z" /><ellipse cx="138" cy="7.5" rx="2.7" ry="4" fill={color} />
    <path className="eqd-engrave" d="M175 5H206M175 9H201" />
  </g>;
}

// Each path is drawn in its assembled position. Only its named parent is translated.
const drawings: Record<Exclude<EquipmentId, 'array'>, Layer[]> = {
  table: [
    layer('feet', 0, 27, <path d="M81 130L97 135V151L81 146ZM225 136L240 132V147L225 151ZM257 106L272 103V116L257 120ZM106 102L119 99V111L106 115Z" />),
    layer('frame', 0, 0, <><path d="M64 106L150 75L288 100L203 134ZM64 106L203 134V150L64 122ZM203 134L288 100V116L203 150Z" /><path className="eqd-engrave" d="M72 117L196 142M210 140L279 113" /></>),
    layer('surface', 0, -31, <><path d="M60 102L149 69L292 95L203 130ZM60 102L203 130V134L60 107ZM203 130L292 95V99L203 134Z" />
      <path className="eqd-engrave" d="M83 94L227 121M106 85L250 112M128 77L272 103M84 107L173 74M108 111L197 79M131 116L220 83M155 120L244 87M178 125L268 92" /></>),
  ],
  source: [
    layer('mount', 0, 32, <><path d="M148 145L174 138L204 144L179 153ZM148 145L179 153V158L148 151ZM170 143V108H181V146Z" /><path d="M156 109Q175 123 191 109L187 119Q172 130 158 118Z" /></>),
    layer('body', -30, -10, <><path d="M114 77L186 85Q201 103 181 117L108 109Z" /><ellipse cx="111" cy="93" rx="9" ry="17" transform="rotate(9 111 93)" />
      <path className="eqd-engrave" d="M119 84L177 91M117 101L176 109" /><ellipse cx="183" cy="101" rx="8" ry="17" transform="rotate(9 183 101)" /></>),
    layer('nozzle', 35, 4, <><path d="M182 93L249 104L248 117L181 109Z" /><ellipse cx="185" cy="101" rx="5" ry="12" /><ellipse cx="249" cy="110" rx="5" ry="10" />
      <ellipse className="eqd-port" cx="249.5" cy="110" rx="2" ry="5" /></>),
  ],
  slm: [
    layer('modulator', -22, 5, <><path d="M70 85L100 70L177 81L145 96ZM70 85L145 96V144L70 133ZM145 96L177 81V130L145 144Z" />
      <path className="eqd-inset" d="M79 98L132 106V127L79 119Z" /><path className="eqd-engrave" d="M84 104L127 111M84 110L127 117M96 102V120M108 104V122M119 106V124" /></>),
    layer('relay', 22, -22, <><path d="M229 145L257 134L269 138L241 151ZM242 140V111H249V138Z" />
      <path d="M229 83L250 75L262 105L241 113Z" /><path className="eqd-glass" d="M234 86L248 81L256 102L243 108Z" /></>),
    layer('ports', 17, 22, <><path d="M157 100L173 104V112L157 108ZM169 91L185 95V103L169 99Z" />
      <ellipse cx="173" cy="108" rx="3" ry="4.5" fill="#71d9a9" /><ellipse cx="185" cy="99" rx="3" ry="4.5" fill="#80a8fa" /></>),
  ],
  aod: [
    layer('mount', -2, 33, <><path d="M144 132V111H153V132ZM205 132V110H213V132Z" /><path d="M125 134L155 126L232 133L200 143ZM125 134L200 143V149L125 141ZM200 143L232 133V139L200 149Z" /></>),
    layer('deflector', -23, -16, <><path d="M115 86L141 75L213 83L189 95ZM115 86L189 95V118L115 108ZM189 95L213 83V107L189 118Z" />
      <path className="eqd-engrave" d="M133 93L145 99L153 95L162 103L173 99" /><path className="eqd-inset" d="M122 101L139 103V106L122 104Z" /></>),
    layer('port', 41, -4, <><path d="M197 92L214 95V109L197 106ZM213 97L230 99V108L213 106Z" />
      <ellipse cx="230" cy="103.5" rx="3.8" ry="5.5" className="eqd-glass" /></>),
  ],
  vacuum: [
    layer('objective', 0, 30, <><path d="M151 123H203V137Q177 147 151 137ZM161 138Q178 145 193 138V149Q177 157 161 149Z" /><ellipse className="eqd-glass" cx="177" cy="150" rx="14" ry="4" /></>),
    layer('pump', 39, 6, <><path d="M221 94L253 91V104L221 111Z" /><ellipse cx="252" cy="98" rx="6" ry="12" /><ellipse className="eqd-inset" cx="254" cy="98" rx="3" ry="7" /></>),
    layer('chamber', -12, -26, <><path d="M122 82Q177 57 232 82V124Q180 151 122 124Z" fillOpacity=".7" /><ellipse cx="177" cy="80" rx="57" ry="15" /><ellipse className="eqd-inset" cx="177" cy="80" rx="45" ry="9" />
      <path className="eqd-engrave" d="M134 89V126M157 95V131M196 95V131M219 89V125M123 119Q177 144 231 119" /></>),
  ],
  gate: [
    layer('mount', 1, 30, <><path d="M137 140L162 127L248 136L223 151ZM137 140L223 151V157L137 147ZM223 151L248 136V143L223 157Z" /><path d="M166 130V94H175V132ZM219 135V93H227V135Z" /></>),
    layer('clock', 23, -31, <LaserHead y={77} color="#ffcc7e" />),
    layer('rydberg', -37, -6, <LaserHead y={96} color="#b089fc" />),
    layer('probe', 25, 15, <LaserHead y={115} color="#ffad69" />),
  ],
  imaging: [
    layer('mount', 36, 4, <><path d="M225 151H252L262 145H235ZM234 147V73H241V146Z" /><path d="M172 70H240V77H172Z" /></>),
    layer('objective', -8, 32, <><path d="M145 102H183V119Q164 127 145 119ZM151 121Q164 126 177 121V132Q164 139 151 132Z" />
      <ellipse className="eqd-glass" cx="164" cy="132" rx="12" ry="4" /></>),
    layer('camera', -9, -27, <><path d="M135 79L148 69H195L181 79ZM135 79H181V104H135ZM181 79L195 69V94L181 104Z" />
      <path className="eqd-engrave" d="M143 86V96M148 86V96M153 86V96" /><circle cx="174" cy="91" r="2" fill="#f6bc8c" /></>),
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
  table: [49, 18, 258, 182], source: [64, 42, 239, 162], slm: [39, 29, 264, 155],
  aod: [80, 33, 215, 163], vacuum: [98, 18, 210, 180], array: [48, 15, 264, 182],
  gate: [88, 18, 203, 180], imaging: [116, 22, 194, 168],
};

export function EquipmentDiagram({ id, split, selected, onSelect, atoms, rows, columns, geometryRecorded = true }: Props) {
  const item = machineEquipment[id];
  const layers = id === 'array' ? arrayLayers(rows, columns, geometryRecorded ? atoms : []) : drawings[id];
  const amount = split / 100;
  const [left, top, width, height] = diagramBounds[id];
  return <svg className="equipment-diagram" viewBox={diagramBounds[id].join(' ')} role="group"
    aria-label={`${item.label}，二维结构示意`} data-testid="equipment-diagram">
    <title>{item.label} · 二维结构示意</title>
    <text className="eqd-caption" x={left + 4} y={top + 12}>二维结构示意</text>
    {layers.map(({ id: partId, dx, dy, shapes }) => {
      const part = item.parts.find(part => part.id === partId)!;
      const active = selected === partId;
      const choose = () => onSelect(active ? null : partId);
      return <g key={partId} transform={`translate(${dx * amount} ${dy * amount})`} role="button"
        tabIndex={0} aria-label={part.label} aria-pressed={active} className="eqd-part" data-diagram-part={partId}
        onClick={choose} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
        }}>
        <title>{part.label}</title>{shapes}
      </g>;
    })}
    {id === 'array' && (!geometryRecorded || !atoms.length) && <text className="eqd-caption" x={left + width - 4} y={top + height - 4} textAnchor="end">
      {geometryRecorded ? '本帧无原子' : '本帧坐标缺测'}
    </text>}
  </svg>;
}
