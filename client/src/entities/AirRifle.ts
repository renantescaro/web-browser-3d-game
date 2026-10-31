import * as THREE from "three";
import { Model } from "./Model";

const BARREL_LENGTH = 0.62;
/** O corpo da arma fica um pouco acima da mão que segura o gatilho. */
const ABOVE_HAND = 0.05;

/**
 * Espingarda de pressão de parque de diversões, com uma rolha na ponta. O `root` fica na
 * mão; o cano aponta para -Y do `root` (a direção do braço) e a coronha vai para +Y, até
 * o ombro. +Z do `root` é "para cima" quando o braço está esticado para a frente.
 */
export class AirRifle extends Model {
  constructor() {
    super();
    const wood = this.mat(0x8a4f24, false, 0.6);
    const metal = this.mat(0x2b2d33, false, 0.35);

    const stock = this.mesh(new THREE.BoxGeometry(0.05, 0.34, 0.09), wood);
    stock.position.set(0, 0.3, ABOVE_HAND - 0.02);
    const receiver = this.mesh(new THREE.BoxGeometry(0.045, 0.22, 0.06), metal);
    receiver.position.set(0, 0.03, ABOVE_HAND);
    const barrel = this.mesh(new THREE.CylinderGeometry(0.014, 0.016, BARREL_LENGTH, 8), metal);
    barrel.position.set(0, -BARREL_LENGTH / 2 - 0.08, ABOVE_HAND + 0.01);
    const sight = this.mesh(new THREE.BoxGeometry(0.01, 0.02, 0.03), metal);
    sight.position.set(0, -BARREL_LENGTH - 0.05, ABOVE_HAND + 0.035);
    const cork = this.mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.035, 8), this.mat(0xd9b27c));
    cork.position.set(0, -BARREL_LENGTH - 0.1, ABOVE_HAND + 0.01);
    this.root.visible = false;
  }
}
