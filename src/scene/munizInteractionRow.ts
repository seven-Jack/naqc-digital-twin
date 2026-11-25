import * as T from 'three';
import { interactionSiteXUm, munizEvidence } from '../data/hardwareEvidence';
import { sceneUnitsPerMetre } from '../data/machineSceneProfile';

export const sceneUnitsPerMicrometre = sceneUnitsPerMetre * 1e-6;

/** Local vertices are in micrometres. Only trap centres and the adjacent row's ordinate are specified. */
export function publishedInteractionRow(arrayY: number) {
  const row = new T.Group();
  row.scale.setScalar(sceneUnitsPerMicrometre);
  row.position.y = arrayY;
  const siteMaterial = new T.MeshBasicMaterial({ color: '#9be4cb' });
  const markerGeometry = new T.SphereGeometry(0.14, 20, 14);
  const ringMaterial = new T.MeshBasicMaterial({ color: '#5b9085' });
  const ringGeometry = new T.TorusGeometry(0.46, 0.025, 8, 40);
  for (const x of interactionSiteXUm) {
    const site = new T.Mesh(markerGeometry, siteMaterial);
    site.name = 'trap-centre';
    const ring = new T.Mesh(ringGeometry, ringMaterial);
    site.position.x = ring.position.x = x;
    row.add(site, ring);
  }
  const first = interactionSiteXUm[0], last = interactionSiteXUm[interactionSiteXUm.length - 1];
  const gapY = -munizEvidence.interactionRowGapUm;
  const guides = [
    first, 0, 0, last, 0, 0,
    first, gapY, 0, last, gapY, 0,
  ];
  row.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(guides, 3)),
    new T.LineBasicMaterial({ color: '#586862' })));
  const scale = [
    first, 1.4, 0, first + munizEvidence.gatePitchUm, 1.4, 0,
    first, 1.2, 0, first, 1.6, 0,
    first + munizEvidence.gatePitchUm, 1.2, 0, first + munizEvidence.gatePitchUm, 1.6, 0,
    last + 1.5, 0, 0, last + 1.5, gapY, 0,
    last + 1.3, 0, 0, last + 1.7, 0, 0,
    last + 1.3, gapY, 0, last + 1.7, gapY, 0,
  ];
  row.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(scale, 3)),
    new T.LineBasicMaterial({ color: '#cab993' })));
  return row;
}
