import type { MachineOpticalHighlight } from '../data/machineSceneProfile';
import type { MachineProfile } from '../data/machineProfile';
import { pulseAt } from './gateSequence';
import type { MachineFrame } from '../physics/quantumComputer';
import type { EquipmentId } from '../data/machineEquipment';

function opticalHighlight(frame: MachineFrame): MachineOpticalHighlight | null {
  const { stage, atoms, activeQubits, gateProgress = 0.5, representativeReady } = frame;
  switch (stage.id) {
    case 'cooling': return 'cooling';
    case 'loading': return 'reservoir';
    case 'rearrangement': return atoms.some(atom => atom.moving) ? 'transport' : null;
    case 'replenishment': return atoms.some(atom => atom.moving) ? 'transport' : null;
    case 'occupancy-check': return frame.occupancy?.exposing ? 'occupancy-check' : null;
    case 'occupancy-recheck': return frame.occupancy?.exposing ? 'occupancy-recheck' : null;
    case 'preparation': return activeQubits.length ? 'preparation' : null;
    case 'transfer': return representativeReady ? 'to-science' : null;
    case 'gates':
      if (frame.stageSkipped) return null;
      if (activeQubits.length === 1) return pulseAt('H', gateProgress);
      return activeQubits.length === 2 ? pulseAt('CZ', gateProgress) : null;
    case 'analysis': return activeQubits.length ? 'raman-analysis' : null;
    case 'return': return representativeReady ? 'to-reservoir' : null;
    case 'readout': return atoms.some(atom => atom.bright !== undefined) ? 'readout' : null;
  }
}

export function projectMachineScene(frame: MachineFrame, profile: MachineProfile, showSupplyAnimation = false) {
  // The public apparatus description gives the sequence, not trajectories for a replayed shot.
  const illustratedSupply = showSupplyAnimation && frame.stage.id === 'cooling';
  const elevatorProgress = illustratedSupply && frame.stageProgress >= 0.5 ? 2 * frame.stageProgress - 1 : null;
  const highlight = elevatorProgress === null ? opticalHighlight(frame) : 'elevator';
  const { stage, atoms, activeQubits, stageProgress, complete, representativeReady } = frame;
  const cooling = stage.id === 'cooling';
  const pulse = complete ? 1 : 0.6 + 0.4 * Math.sin(stageProgress * Math.PI);
  const trapStrength = cooling ? 0.1 : 0.83;
  const observation = frame.occupancy?.observations.at(-1);
  const occupancyExposure = Boolean(frame.occupancy?.exposing);
  let scienceWeight = 0;
  if (representativeReady) {
    if (stage.id === 'transfer') scienceWeight = stageProgress;
    if (stage.id === 'gates' || stage.id === 'analysis') scienceWeight = 1;
    if (stage.id === 'return') scienceWeight = 1 - stageProgress;
  }

  const darkBit = profile.readoutBrightBit === '0' ? '1' : '0';
  const descriptor = highlight === null ? null : profile.scene.highlights[highlight];
  const activePath = descriptor === null ? null : {
    id: highlight,
    color: descriptor.color,
    label: highlight === 'readout'
      ? `${descriptor.label} · |${profile.readoutBrightBit}⟩ 亮、|${darkBit}⟩ 暗`
      : descriptor.label,
  };
  let fluorescence: string | null = null;
  if (highlight === 'readout' && activeQubits.length) {
    const observed = activeQubits.map(qubit => atoms.find(atom => atom.qubit === qubit)?.bright);
    if (observed.every(bright => bright !== undefined)) {
      fluorescence = observed.map(bright => bright ? profile.readoutBrightBit : darkBit).join('');
    }
  }

  const collecting = highlight === 'readout' || occupancyExposure;
  const emittingAtoms = new Set(collecting ? atoms.filter(atom => atom.bright === true ||
    (occupancyExposure && Math.abs(atom.row - profile.array.registerRow) < 0.001)).map(atom => atom.id) : []);
  return {
    illustratedSupply, elevatorProgress,
    emittingAtoms,
    stage: stage.id,
    stageProgress,
    attemptNumber: frame.attemptIndex + 1,
    atoms,
    activeQubits,
    activePath,
    fluorescence,
    occupancy: observation?.sites.map(site => site.occupied ? '1' : '0').join('') ?? null,
    occupancyPhase: observation?.phase ?? null,
    occupancyExposure,
    activeMove: frame.activeMove,
    movingAtom: frame.activeMove?.atomId ?? null,
    skipped: frame.stageSkipped,
    scienceWeight,
    strengths: {
      reservoir: trapStrength * (1 - scienceWeight),
      science: trapStrength * scienceWeight,
      transport: highlight === 'transport' ? pulse : 0.045,
      objective: trapStrength,
      clock: highlight === 'clock-shelve' || highlight === 'clock-return' ? pulse : 0.07,
      rydberg: highlight === 'rydberg' ? pulse : 0.07,
      probe: highlight === 'readout' || occupancyExposure ? pulse : highlight === 'preparation' ? 0.48 : 0.06,
      cooling: highlight === 'cooling' ? pulse : 0,
      grid: cooling ? 0.12 : 0.30,
      trapFan: cooling ? 0.045 : 0.18,
    },
    transport: highlight === 'transport',
    raman: highlight === 'raman' || highlight === 'raman-analysis',
    blockade: highlight === 'rydberg',
    collecting,
    readout: stage.id === 'readout',
  };
}

export type MachineSceneFrame = ReturnType<typeof projectMachineScene>;

/** Optical parts carrying the highlighted path in the illustrated apparatus. */
export function illuminatedPart(id: EquipmentId | null, scene: MachineSceneFrame) {
  const path = scene.activePath?.id;
  if (id === 'source' && path === 'cooling') return 'body';
  if (id === 'source' && path === 'elevator') return 'nozzle';
  if (id === 'aod' && scene.transport) return 'port';
  if (id === 'imaging' && scene.collecting) return 'objective';
  const fixedTweezers = path === 'reservoir' || path === 'to-science' || path === 'to-reservoir';
  if (id === 'slm' && fixedTweezers) return 'ports';
  if (id === 'vacuum' && (fixedTweezers || scene.transport || scene.raman)) return 'objective';
  if (id === 'gate') {
    if (path === 'clock-shelve' || path === 'clock-return') return 'clock';
    if (path === 'rydberg') return 'rydberg';
    if (path === 'readout' || scene.occupancyExposure || path === 'preparation') return 'probe';
  }
  return null;
}
