import * as THREE from "three";
import { Animal } from "./Animal";

/** Cavalo feito de primitivas Three.js. Escala ~1,50 m de altura. */
export class Horse extends Animal {
  protected build(): void {
    const main = this.mat(this.color);
    const limb = this.mat(this.darker(0.60));
    const mane = this.mat(this.darker(0.38));
    const dark = this.mat(0x111111);

    // Pernas longas (4)
    const legGeo = new THREE.CapsuleGeometry(0.07, 0.68, 4, 8);
    for (const [x, z] of [[-0.15, 0.48], [0.15, 0.48], [-0.15, -0.48], [0.15, -0.48]] as [number, number][]) {
      this.mesh(legGeo, limb).position.set(x, 0.41, z);
    }

    // Corpo grande
    this.mesh(new THREE.BoxGeometry(0.42, 0.46, 1.40), main).position.set(0, 1.05, 0);

    // Pescoço inclinado para frente/cima
    const neck = this.mesh(new THREE.BoxGeometry(0.20, 0.44, 0.22), main);
    neck.position.set(0, 1.28, 0.62);
    neck.rotation.x = -0.45;

    // Cabeça alongada
    this.mesh(new THREE.BoxGeometry(0.22, 0.26, 0.46), main).position.set(0, 1.62, 0.80);

    // Orelhas
    const earGeo = new THREE.BoxGeometry(0.065, 0.14, 0.045);
    for (const x of [-0.075, 0.075]) {
      this.mesh(earGeo, main).position.set(x, 1.77, 0.74);
    }

    // Crina ao longo do pescoço (3 blocos)
    const maneGeo = new THREE.BoxGeometry(0.06, 0.12, 0.13);
    for (const [y, z] of [[1.35, 0.50], [1.46, 0.61], [1.56, 0.69]] as [number, number][]) {
      this.mesh(maneGeo, mane).position.set(0, y, z);
    }

    // Rabo
    const tail = this.mesh(new THREE.CapsuleGeometry(0.05, 0.52, 4, 8), mane);
    tail.position.set(0, 1.08, -0.73);
    tail.rotation.x = Math.PI * 0.2;

    // Narinas
    const nostrilGeo = new THREE.SphereGeometry(0.028, 8, 6);
    for (const x of [-0.055, 0.055]) {
      this.mesh(nostrilGeo, dark).position.set(x, 1.58, 1.02);
    }

    // Olhos (nas laterais da cabeça)
    const eyeGeo = new THREE.SphereGeometry(0.030, 8, 6);
    for (const x of [-0.11, 0.11]) {
      this.mesh(eyeGeo, dark).position.set(x, 1.68, 0.83);
    }
  }
}
