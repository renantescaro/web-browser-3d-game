import * as THREE from "three";
import { Tree } from "./Tree";

const TRUNK_HEIGHT = 2;

/** Árvore de copa redonda (carvalho). ~4,6 m de altura em escala 1. */
export class Oak extends Tree {
  readonly trunkRadius = 0.28;
  readonly height = 4.6;

  build(): void {
    const bark = this.mat(0x6b4a2f);
    const leaves = this.mat(0x4f8a3c, true);
    const leavesLight = this.mat(0x63a14a, true);

    this.mesh(new THREE.CylinderGeometry(0.2, this.trunkRadius, TRUNK_HEIGHT, 8), bark).position.y = TRUNK_HEIGHT / 2;

    // Copa: algumas esferas facetadas sobrepostas
    const big = new THREE.IcosahedronGeometry(1.4, 1);
    const small = new THREE.IcosahedronGeometry(0.95, 1);
    this.mesh(big, leaves).position.set(0, 3.2, 0);
    this.mesh(small, leavesLight).position.set(0.85, 2.8, 0.3);
    this.mesh(small, leaves).position.set(-0.7, 2.9, -0.5);
    this.mesh(small, leavesLight).position.set(0.1, 3.75, -0.2);
  }
}
