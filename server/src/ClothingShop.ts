// A loja de roupas e acessórios da Deendi: do lado de fora da praça, no lado da placa que o
// comerciante não usa. O servidor tem a autoridade sobre o dinheiro e o que cada um veste.
import {
  CLOTHING_COUNTER_OFFSET,
  CLOTHING_SELLER_APPEARANCE,
  CLOTHING_SELLER_NAME,
  CLOTHING_SHOP_RANGE,
  CLOTHING_SIGN_TEXT,
  CLOTHING_SQUARE_GAP,
  OUTFIT_BUY_COOLDOWN_MS,
  SQUARE_RADIUS,
} from "@jogo/shared/constants";
import { distanceXZ, forwardFromYaw, wrapAngle } from "@jogo/shared/math";
import { isWearing, outfitItem, wear, type Outfit, type OutfitItemId } from "@jogo/shared/outfits";
import type { ClothingShopData, SquareData, Vec3 } from "@jogo/shared/protocol";
import type { Room } from "./Room.js";
import { signSides } from "./Square.js";

/** Raio (m) em volta da loja onde não nascem árvores. */
const CLEAR_RADIUS = 4;
/** Folga (m) na distância até o balcão, pela latência. */
const DISTANCE_SLACK = 1.5;

export interface OutfitSale {
  money: number;
  outfit: Outfit;
}

export class ClothingShop {
  /** Pés da Deendi. */
  readonly position: Vec3;
  readonly rotationY: number;
  readonly counter: Vec3;
  private readonly lastSaleAt = new Map<string, number>();

  constructor(
    square: SquareData,
    private readonly room: Room,
  ) {
    const angle = signSides(square).narrow;
    const dist = SQUARE_RADIUS + CLOTHING_SQUARE_GAP;
    this.position = {
      x: square.position.x + Math.sin(angle) * dist,
      y: 0,
      z: square.position.z + Math.cos(angle) * dist,
    };
    // Olha para o centro da praça; o balcão fica entre ela e os clientes.
    this.rotationY = wrapAngle(angle + Math.PI);
    const forward = forwardFromYaw(this.rotationY);
    this.counter = {
      x: this.position.x + forward.x * CLOTHING_COUNTER_OFFSET,
      y: 0,
      z: this.position.z + forward.z * CLOTHING_COUNTER_OFFSET,
    };
  }

  /**
   * Vende `item` ao jogador, que já sai vestindo (trocando o que estiver na mesma parte do corpo).
   * Só vale perto do balcão, respeitando o intervalo, com dinheiro e se ele ainda não veste o item.
   * Retorna o novo saldo e as roupas, ou null se recusado.
   */
  sell(playerId: string, item: OutfitItemId): OutfitSale | null {
    const position = this.room.positionOf(playerId);
    const current = this.room.outfitOf(playerId);
    if (!position || !current || isWearing(current, item)) return null;
    const now = Date.now();
    if (now - (this.lastSaleAt.get(playerId) ?? 0) < OUTFIT_BUY_COOLDOWN_MS) return null;
    if (distanceXZ(position, this.counter) > CLOTHING_SHOP_RANGE + DISTANCE_SLACK) return null;

    const money = this.room.spendMoney(playerId, outfitItem(item).price);
    if (money === null) return null;
    const outfit = wear(current, item);
    this.room.setOutfit(playerId, outfit);
    this.lastSaleAt.set(playerId, now);
    return { money, outfit };
  }

  /** O jogador saiu: esquece o intervalo dele. */
  forget(playerId: string): void {
    this.lastSaleAt.delete(playerId);
  }

  /** Área (centro e raio) onde não podem nascer árvores. */
  clearArea(): { x: number; z: number; radius: number } {
    return { x: this.position.x, z: this.position.z, radius: CLEAR_RADIUS };
  }

  toData(): ClothingShopData {
    return {
      sellerName: CLOTHING_SELLER_NAME,
      appearance: CLOTHING_SELLER_APPEARANCE,
      position: this.position,
      rotationY: this.rotationY,
      counter: this.counter,
      signText: CLOTHING_SIGN_TEXT,
    };
  }
}
