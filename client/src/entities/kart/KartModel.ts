import * as THREE from "three";
import { Model } from "../Model";

const WHEEL_RADIUS = 0.17;
/** Rodas: x (lado), z (frente/trás) e largura. As de trás são mais largas. */
const WHEELS = [
  { x: 0.5, z: 0.58, width: 0.13 },
  { x: -0.5, z: 0.58, width: 0.13 },
  { x: 0.53, z: -0.6, width: 0.19 },
  { x: -0.53, z: -0.6, width: 0.19 },
] as const;
/** Volante, na frente do banco. */
const WHEEL_CENTER = { y: 0.62, z: 0.3 } as const;

/**
 * Kart de aluguel: chassi baixo, laterais e bico na cor do piloto, banco, motor atrás, volante
 * e quatro rodas que giram com a velocidade. A origem fica no chão, no meio do kart; a frente
 * olha para +Z.
 */
export class KartModel extends Model {
  private readonly wheels: THREE.Group[] = [];
  private spin = 0;

  constructor(color: THREE.ColorRepresentation) {
    super();
    const paint = this.mat(color, false, 0.45);
    const black = this.mat(0x1b1b1e, false, 0.8);
    const metal = this.mat(0x9aa0a8, false, 0.35);

    // Chassi e carenagem.
    this.mesh(new THREE.BoxGeometry(0.9, 0.06, 1.6), metal).position.set(0, 0.13, 0);
    for (const side of [-1, 1]) this.mesh(new THREE.BoxGeometry(0.16, 0.16, 0.95), paint).position.set(side * 0.38, 0.22, 0.02);
    const nose = this.mesh(new THREE.BoxGeometry(0.76, 0.18, 0.4), paint);
    nose.position.set(0, 0.24, 0.72);
    nose.rotation.x = -0.18;
    this.mesh(new THREE.BoxGeometry(0.95, 0.1, 0.12), black).position.set(0, 0.2, 0.95);
    this.mesh(new THREE.BoxGeometry(1.05, 0.14, 0.14), black).position.set(0, 0.22, -0.88);

    // Banco (encosto atrás) e motor do lado.
    this.mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), black).position.set(0, 0.3, -0.25);
    const back = this.mesh(new THREE.BoxGeometry(0.42, 0.42, 0.08), black);
    back.position.set(0, 0.52, -0.47);
    back.rotation.x = -0.2;
    this.mesh(new THREE.BoxGeometry(0.26, 0.24, 0.3), metal).position.set(0.3, 0.33, -0.62);
    const exhaust = this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), black);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.3, 0.3, -0.85);

    // Coluna e volante, inclinados para o piloto.
    const column = this.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), metal);
    column.position.set(0, 0.45, 0.48);
    column.rotation.x = 0.85;
    const wheel = this.mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 18), black);
    wheel.position.set(0, WHEEL_CENTER.y, WHEEL_CENTER.z);
    wheel.rotation.x = -0.75;

    const tire = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 1, 16);
    const hub = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.45, WHEEL_RADIUS * 0.45, 1, 10);
    for (const w of WHEELS) {
      const group = new THREE.Group();
      group.position.set(w.x, WHEEL_RADIUS, w.z);
      this.root.add(group);
      const t = this.mesh(tire, black, group);
      t.rotation.z = Math.PI / 2;
      t.scale.y = w.width;
      const h = this.mesh(hub, metal, group);
      h.rotation.z = Math.PI / 2;
      h.scale.y = w.width + 0.02;
      this.wheels.push(group);
    }
  }

  /** Gira as rodas conforme a velocidade (m/s; negativa = ré). */
  update(dt: number, speed: number): void {
    this.spin += (speed / WHEEL_RADIUS) * dt;
    for (const w of this.wheels) w.rotation.x = this.spin;
  }
}
