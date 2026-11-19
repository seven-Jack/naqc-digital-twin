import type { MachineOpticalHighlight } from '../data/machineSceneProfile';
import type { MachineProfile } from '../data/machineProfile';
import type { MachineFrame } from '../physics/quantumComputer';

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
      if (activeQubits.length === 1) return 'raman';
      if (activeQubits.length !== 2) return null;
      // The thirds of a CZ animation are display timing.
      if (gateProgress < 1 / 3) return 'clock-shelve';
      if (gateProgress < 2 / 3) return 'rydberg';
      return 'clock-return';
    case 'analysis': return activeQubits.length ? 'raman-analysis' : null;
    case 'return': return representativeReady ? 'to-reservoir' : null;
    case 'readout': return atoms.some(atom => atom.bright !== undefined) ? 'readout' : null;
  }
}

export function projectMachineScene(frame: MachineFrame, profile: MachineProfile) {
  const highlight = opticalHighlight(frame);
  const { stage, atoms, activeQubits, stageProgress, complete, representativeReady } = frame;
  const cooling = highlight === 'cooling';
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

  return {
    stage: stage.id,
    atoms,
    activeQubits,
    activePath,
    fluorescence,
    occupancy: observation?.sites.map(site => site.occupied ? '1' : '0').join('') ?? null,
    occupancyPhase: observation?.phase ?? null,
    occupancyExposure,
    movingAtom: atoms.find(atom => atom.moving)?.id ?? null,
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
      cooling: cooling ? pulse : 0,
      grid: cooling ? 0.12 : 0.30,
      trapFan: cooling ? 0.045 : 0.18,
    },
    transport: highlight === 'transport',
    raman: highlight === 'raman' || highlight === 'raman-analysis',
    blockade: highlight === 'rydberg',
    collecting: highlight === 'readout' || occupancyExposure,
    readout: stage.id === 'readout',
  };
}

export type MachineSceneFrame = ReturnType<typeof projectMachineScene>;
