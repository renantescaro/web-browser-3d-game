import * as THREE from "three";
import { Tree } from "./Tree";

const TRUNK_HEIGHT = 1.4;
/** Camadas de folhas: [raio, altura, y do centro]. */
const LAYERS: [number, number, number][] = [
  [1.5, 2.0, 2.1],
  [1.15, 1.7, 3.2],
  [0.75, 1.4, 4.3],
];

/** Pinheiro de copa cônica em camadas. ~5 m de altura em escala 1. */
export class Pine extends Tree {
  readonly trunkRadius = 0.22;
  readonly height = 5;

  build(): void {
    const bark = this.mat(0x5a3d26);
    const needles = this.mat(0x2f6b3a, true);

    this.mesh(new THREE.CylinderGeometry(0.16, this.trunkRadius, TRUNK_HEIGHT, 8), bark).position.y = TRUNK_HEIGHT / 2;

    for (const [radius, height, y] of LAYERS) {
      this.mesh(new THREE.ConeGeometry(radius, height, 8), needles).position.y = y;
    }
  }
}
