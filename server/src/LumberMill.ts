// A madeireira do Brenno: do lado de fora da praça, no lado mais livre que sobrar (longe da placa,
// dos bancos e das outras barracas). Compra a madeira cortada das árvores; o servidor tem a
// autoridade sobre o dinheiro e o inventário.
import {
  LUMBER_BUYER_APPEARANCE,
  LUMBER_BUYER_NAME,
  LUMBER_COUNTER_OFFSET,
  LUMBER_RANGE,
  LUMBER_SIGN_TEXT,
  LUMBER_SQUARE_GAP,
  MAX_MONEY,
  SQUARE_RADIUS,
  WOOD_SELL_COOLDOWN_MS,
  WOOD_SELL_PRICE,
} from "@jogo/shared/constants";
import { countOf, withItem, type Inventory } from "@jogo/shared/inventory";
import { distanceXZ, forwardFromYaw, wrapAngle } from "@jogo/shared/math";
import type { LumberMillData, SquareData, Vec3 } from "@jogo/shared/protocol";
import type { Room } from "./Room.js";
import { quietestSide } from "./Square.js";

/** Raio (m) em volta da madeireira onde não nascem árvores. */
const CLEAR_RADIUS = 4;
/** Folga (m) na distância até o balcão, pela latência. */
const DISTANCE_SLACK = 1.5;

export interface WoodSale {
  money: number;
  inventory: Inventory;
}

export class LumberMill {
  /** Pés do Brenno. */
  readonly position: Vec3;
  readonly rotationY: number;
  readonly counter: Vec3;
  private readonly lastSaleAt = new Map<string, number>();

  /** `occupied`: onde já estão as outras barracas, para não ficar em cima delas. */
  constructor(
    square: SquareData,
    occupied: readonly { x: number; z: number }[],
    private readonly room: Room,
  ) {
    const angle = quietestSide(square, occupied);
    const dist = SQUARE_RADIUS + LUMBER_SQUARE_GAP;
    this.position = {
      x: square.position.x + Math.sin(angle) * dist,
      y: 0,
      z: square.position.z + Math.cos(angle) * dist,
    };
    // Olha para o centro da praça; o balcão fica entre ele e os clientes.
    this.rotationY = wrapAngle(angle + Math.PI);
    const forward = forwardFromYaw(this.rotationY);
    this.counter = {
      x: this.position.x + forward.x * LUMBER_COUNTER_OFFSET,
      y: 0,
      z: this.position.z + forward.z * LUMBER_COUNTER_OFFSET,
    };
  }

  /**
   * Compra `amount` madeiras do jogador. Só vale perto do balcão, respeitando o intervalo, se ele
   * tiver essa madeira toda e o dinheiro não passar de `MAX_MONEY`.
   * Retorna o novo saldo e o inventário, ou null se recusado.
   */
  buy(playerId: string, amount: number): WoodSale | null {
    const position = this.room.positionOf(playerId);
    const inventory = this.room.inventoryOf(playerId);
    if (!position || !inventory || countOf(inventory, "wood") < amount) return null;
    const now = Date.now();
    if (now - (this.lastSaleAt.get(playerId) ?? 0) < WOOD_SELL_COOLDOWN_MS) return null;
    if (distanceXZ(position, this.counter) > LUMBER_RANGE + DISTANCE_SLACK) return null;
    const current = this.room.moneyOf(playerId);
    if (current === null || current + amount * WOOD_SELL_PRICE > MAX_MONEY) return null;

    const money = this.room.earnMoney(playerId, amount * WOOD_SELL_PRICE);
    if (money === null) return null;
    const next = withItem(inventory, "wood", -amount);
    this.room.setInventory(playerId, next);
    this.lastSaleAt.set(playerId, now);
    return { money, inventory: next };
  }

  /** O jogador saiu: esquece o intervalo dele. */
  forget(playerId: string): void {
    this.lastSaleAt.delete(playerId);
  }

  /** Área (centro e raio) onde não podem nascer árvores. */
  clearArea(): { x: number; z: number; radius: number } {
    return { x: this.position.x, z: this.position.z, radius: CLEAR_RADIUS };
  }

  toData(): LumberMillData {
    return {
      buyerName: LUMBER_BUYER_NAME,
      appearance: LUMBER_BUYER_APPEARANCE,
      position: this.position,
      rotationY: this.rotationY,
      counter: this.counter,
      signText: LUMBER_SIGN_TEXT,
      woodPrice: WOOD_SELL_PRICE,
    };
  }
}
