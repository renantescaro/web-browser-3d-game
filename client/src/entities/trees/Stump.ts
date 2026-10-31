import * as THREE from "three";
import { STUMP_HEIGHT } from "@jogo/shared/constants";
import { Model } from "../Model";

/**
 * Toco que fica no lugar de uma árvore derrubada: tronco curto com os anéis por cima e algumas
 * lascas no chão. Em escala 1; a escala da árvore é aplicada no `root`.
 */
export class Stump extends Model {
  constructor(
    readonly radius: number,
    scale: number,
  ) {
    super();
    this.root.scale.setScalar(scale);
    const bark = this.mat(0x6b4a2f);
    const wood = this.mat(0xd9b382);

    const trunk = this.mesh(new THREE.CylinderGeometry(radius, radius * 1.15, STUMP_HEIGHT, 10), bark);
    trunk.position.y = STUMP_HEIGHT / 2;
    // Corte meio torto, como feito a machado.
    const top = this.mesh(new THREE.CircleGeometry(radius * 0.95, 10), wood);
    top.rotation.set(-Math.PI / 2 + 0.08, 0, 0);
    top.position.y = STUMP_HEIGHT + 0.005;
    const ring = this.mesh(new THREE.RingGeometry(radius * 0.4, radius * 0.48, 10), bark);
    ring.rotation.copy(top.rotation);
    ring.position.y = STUMP_HEIGHT + 0.01;

    const chip = new THREE.BoxGeometry(0.1, 0.02, 0.05);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.4;
      const piece = this.mesh(chip, wood);
      piece.position.set(Math.sin(angle) * (radius + 0.25), 0.01, Math.cos(angle) * (radius + 0.25));
      piece.rotation.y = angle * 1.7;
    }
  }
}
