// A barraca de Tiro ao Alvo: do lado de fora da praça, de frente para a fonte, no maior
// vão entre bancos que não tem a placa (lá fica o comerciante). Assim o caminho da fonte
// até o balcão fica livre.
import {
  SHOOTING_BOOTH_DEPTH,
  SHOOTING_OWNER_APPEARANCE,
  SHOOTING_OWNER_NAME,
  SHOOTING_OWNER_OFFSET,
  SHOOTING_SIGN_TEXT,
  SHOOTING_SQUARE_GAP,
  SQUARE_RADIUS,
} from "@jogo/shared/constants";
import { localToWorldXZ, wrapAngle } from "@jogo/shared/math";
import type { ShootingBoothData, SquareData, Vec3 } from "@jogo/shared/protocol";
import { benchGaps } from "./Square.js";

export class ShootingBooth {
  /** Centro do balcão. */
  readonly position: Vec3;
  readonly rotationY: number;
  readonly ownerPosition: Vec3;

  constructor(square: SquareData) {
    const { x: cx, z: cz } = square.position;
    // Sempre há 2+ bancos, então há um vão sem a placa; por garantia, o lado oposto à placa.
    const angle =
      benchGaps(square).find((g) => !g.hasSign)?.center ??
      Math.atan2(square.sign.position.x - cx, square.sign.position.z - cz) + Math.PI;
    const dist = SQUARE_RADIUS + SHOOTING_SQUARE_GAP;
    this.position = { x: cx + Math.sin(angle) * dist, y: 0, z: cz + Math.cos(angle) * dist };
    // A frente do balcão olha para o centro da praça.
    this.rotationY = wrapAngle(angle + Math.PI);
    const owner = localToWorldXZ(this.position, this.rotationY, SHOOTING_OWNER_OFFSET.x, SHOOTING_OWNER_OFFSET.z);
    this.ownerPosition = { x: owner.x, y: 0, z: owner.z };
  }

  /** Área (centro e raio) onde não podem nascer árvores. */
  clearArea(): { x: number; z: number; radius: number } {
    const center = localToWorldXZ(this.position, this.rotationY, 0, -SHOOTING_BOOTH_DEPTH / 2);
    return { ...center, radius: SHOOTING_BOOTH_DEPTH + 2 };
  }

  toData(): ShootingBoothData {
    return {
      ownerName: SHOOTING_OWNER_NAME,
      appearance: SHOOTING_OWNER_APPEARANCE,
      ownerPosition: this.ownerPosition,
      position: this.position,
      rotationY: this.rotationY,
      signText: SHOOTING_SIGN_TEXT,
    };
  }
}
