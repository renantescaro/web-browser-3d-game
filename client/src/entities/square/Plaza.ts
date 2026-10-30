import * as THREE from "three";
import { SQUARE_RADIUS } from "@jogo/shared/constants";
import { Model } from "../Model";

/** Um pouco acima da grade do chão (y = 0,01) para não brigar no depth buffer. */
const FLOOR_Y = 0.03;
const BORDER_WIDTH = 0.45;

/** Piso de pedra redondo da praça, com uma borda mais escura. */
export class Plaza extends Model {
  constructor() {
    super();
    const floor = this.mesh(new THREE.CircleGeometry(SQUARE_RADIUS, 48), this.mat(0xc2baa9));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.castShadow = false;

    const border = this.mesh(
      new THREE.RingGeometry(SQUARE_RADIUS - BORDER_WIDTH, SQUARE_RADIUS, 48),
      this.mat(0x8e8676),
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = FLOOR_Y + 0.005;
    border.castShadow = false;
  }
}
