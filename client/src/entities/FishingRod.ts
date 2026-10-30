import * as THREE from "three";
import { Model } from "./Model";

const ROD_LENGTH = 1.8;
const LINE_LENGTH = 1.5;

/**
 * Vara de pescar com linha e boia. O `root` fica na mão; a vara cresce ao longo de +Y
 * do `root`. A linha é girada por `setLineAngle` para pender na vertical.
 */
export class FishingRod extends Model {
  private readonly line = new THREE.Group();
  private readonly bobber: THREE.Mesh;
  private time = 0;

  constructor() {
    super();
    const wood = this.mat(0x8a5a2b, false, 0.7);
    const rod = this.mesh(new THREE.CylinderGeometry(0.012, 0.025, ROD_LENGTH, 6), wood);
    rod.position.y = ROD_LENGTH / 2;

    const reel = this.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 10), this.mat(0x333333, false, 0.4));
    reel.position.set(0.04, 0.2, 0);
    reel.rotation.z = Math.PI / 2;

    this.line.position.y = ROD_LENGTH;
    this.root.add(this.line);
    const lineMesh = this.mesh(new THREE.CylinderGeometry(0.003, 0.003, LINE_LENGTH, 4), this.mat(0xf2f2f2));
    lineMesh.position.y = -LINE_LENGTH / 2;
    lineMesh.castShadow = false;
    this.line.add(lineMesh);

    this.bobber = this.mesh(new THREE.SphereGeometry(0.04, 10, 8), this.mat(0xe63946, false, 0.4), this.line);
    this.bobber.position.y = -LINE_LENGTH;
    this.root.visible = false;
  }

  /** Ângulo (rad, em torno de X) que a linha precisa para ficar na vertical no mundo. */
  setLineAngle(angle: number): void {
    this.line.rotation.x = angle;
  }

  update(dt: number): void {
    this.time += dt;
    this.bobber.position.y = -LINE_LENGTH + Math.sin(this.time * 3) * 0.02;
  }
}
