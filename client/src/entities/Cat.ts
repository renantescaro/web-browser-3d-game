import * as THREE from "three";
import { Animal } from "./Animal";

/** Gato feito de primitivas Three.js. Escala ~0,40 m de altura. */
export class Cat extends Animal {
  protected build(): void {
    const main = this.mat(this.color);
    const limb = this.mat(this.darker());
    const dark = this.mat(0x111111);

    // Pernas (4) — mais finas e curtas que o cachorro
    const legGeo = new THREE.CapsuleGeometry(0.04, 0.14, 4, 8);
    for (const [x, z] of [[-0.07, 0.17], [0.07, 0.17], [-0.07, -0.17], [0.07, -0.17]] as [number, number][]) {
      this.mesh(legGeo, limb).position.set(x, 0.11, z);
    }

    // Corpo (mais estreito e curto)
    this.mesh(new THREE.BoxGeometry(0.18, 0.16, 0.46), main).position.set(0, 0.30, 0);

    // Cabeça (redonda)
    this.mesh(new THREE.SphereGeometry(0.11, 16, 12), main).position.set(0, 0.41, 0.22);

    // Orelhas pontudas (cone quadrado = 4 faces)
    const earGeo = new THREE.ConeGeometry(0.045, 0.09, 4);
    for (const x of [-0.06, 0.06]) {
      this.mesh(earGeo, main).position.set(x, 0.53, 0.20);
    }

    // Rabo longo e erguido
    const tail = this.mesh(new THREE.CapsuleGeometry(0.022, 0.32, 4, 8), limb);
    tail.position.set(0, 0.44, -0.25);
    tail.rotation.x = -Math.PI * 0.65;

    // Nariz pequeno
    this.mesh(new THREE.SphereGeometry(0.018, 8, 6), dark).position.set(0, 0.40, 0.33);

    // Olhos
    const eyeGeo = new THREE.SphereGeometry(0.020, 8, 6);
    for (const x of [-0.055, 0.055]) {
      this.mesh(eyeGeo, dark).position.set(x, 0.43, 0.32);
    }
  }
}
