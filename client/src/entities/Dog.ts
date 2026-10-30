import * as THREE from "three";
import { Animal } from "./Animal";

/** Cachorro feito de primitivas Three.js. Escala ~0,60 m de altura. */
export class Dog extends Animal {
  protected build(): void {
    const main = this.mat(this.color);
    const limb = this.mat(this.darker());
    const dark = this.mat(0x111111);

    // Pernas (4) — mesma geometria reutilizada
    const legGeo = new THREE.CapsuleGeometry(0.055, 0.24, 4, 8);
    for (const [x, z] of [[-0.10, 0.26], [0.10, 0.26], [-0.10, -0.26], [0.10, -0.26]] as [number, number][]) {
      this.mesh(legGeo, limb).position.set(x, 0.175, z);
    }

    // Corpo
    this.mesh(new THREE.BoxGeometry(0.28, 0.24, 0.70), main).position.set(0, 0.47, 0);

    // Cabeça
    const headGeo = new THREE.SphereGeometry(0.14, 16, 12);
    this.mesh(headGeo, main).position.set(0, 0.62, 0.33);

    // Focinho
    this.mesh(new THREE.BoxGeometry(0.10, 0.08, 0.13), main).position.set(0, 0.58, 0.44);

    // Orelhas caídas
    const earGeo = new THREE.BoxGeometry(0.08, 0.14, 0.04);
    for (const x of [-0.10, 0.10]) {
      this.mesh(earGeo, limb).position.set(x, 0.68, 0.31);
    }

    // Rabo
    const tail = this.mesh(new THREE.CapsuleGeometry(0.03, 0.22, 4, 8), main);
    tail.position.set(0, 0.60, -0.36);
    tail.rotation.x = -Math.PI / 4;

    // Nariz
    this.mesh(new THREE.SphereGeometry(0.028, 8, 6), dark).position.set(0, 0.58, 0.51);

    // Olhos
    const eyeGeo = new THREE.SphereGeometry(0.022, 8, 6);
    for (const x of [-0.07, 0.07]) {
      this.mesh(eyeGeo, dark).position.set(x, 0.65, 0.43);
    }
  }
}
