// A loja de ferramentas do Gabriel: do lado de fora da praça, no lado mais livre (longe da placa,
// dos bancos e das outras barracas). O servidor tem a autoridade sobre o dinheiro e as ferramentas.
import {
  SQUARE_RADIUS,
  TOOL_BUY_COOLDOWN_MS,
  TOOL_COUNTER_OFFSET,
  TOOL_SELLER_APPEARANCE,
  TOOL_SELLER_NAME,
  TOOL_SHOP_RANGE,
  TOOL_SIGN_TEXT,
  TOOL_SQUARE_GAP,
} from "@jogo/shared/constants";
import { distanceXZ, forwardFromYaw, wrapAngle } from "@jogo/shared/math";
import { canAdd, withItem, type Inventory } from "@jogo/shared/inventory";
import { toolInfo, type ToolId } from "@jogo/shared/tools";
import type { SquareData, ToolShopData, Vec3 } from "@jogo/shared/protocol";
import type { Room } from "./Room.js";
import { quietestSide } from "./Square.js";

/** Raio (m) em volta da loja onde não nascem árvores. */
const CLEAR_RADIUS = 4;
/** Folga (m) na distância até a bancada, pela latência. */
const DISTANCE_SLACK = 1.5;

export interface ToolSale {
  money: number;
  inventory: Inventory;
}

export class ToolShop {
  /** Pés do Gabriel. */
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
    const dist = SQUARE_RADIUS + TOOL_SQUARE_GAP;
    this.position = {
      x: square.position.x + Math.sin(angle) * dist,
      y: 0,
      z: square.position.z + Math.cos(angle) * dist,
    };
    // Olha para o centro da praça; a bancada fica entre ele e os clientes.
    this.rotationY = wrapAngle(angle + Math.PI);
    const forward = forwardFromYaw(this.rotationY);
    this.counter = {
      x: this.position.x + forward.x * TOOL_COUNTER_OFFSET,
      y: 0,
      z: this.position.z + forward.z * TOOL_COUNTER_OFFSET,
    };
  }

  /**
   * Vende `item` ao jogador, que o guarda no inventário. Só vale perto da bancada, respeitando o
   * intervalo, com dinheiro e espaço no inventário (e menos de `MAX_TOOLS` ferramentas).
   * Retorna o novo saldo e o inventário, ou null se recusado.
   */
  sell(playerId: string, item: ToolId): ToolSale | null {
    const position = this.room.positionOf(playerId);
    const current = this.room.inventoryOf(playerId);
    if (!position || !current || !canAdd(current, item)) return null;
    const now = Date.now();
    if (now - (this.lastSaleAt.get(playerId) ?? 0) < TOOL_BUY_COOLDOWN_MS) return null;
    if (distanceXZ(position, this.counter) > TOOL_SHOP_RANGE + DISTANCE_SLACK) return null;

    const money = this.room.spendMoney(playerId, toolInfo(item).price);
    if (money === null) return null;
    const inventory = withItem(current, item, 1);
    this.room.setInventory(playerId, inventory);
    this.lastSaleAt.set(playerId, now);
    return { money, inventory };
  }

  /** O jogador saiu: esquece o intervalo dele. */
  forget(playerId: string): void {
    this.lastSaleAt.delete(playerId);
  }

  /** Área (centro e raio) onde não podem nascer árvores. */
  clearArea(): { x: number; z: number; radius: number } {
    return { x: this.position.x, z: this.position.z, radius: CLEAR_RADIUS };
  }

  toData(): ToolShopData {
    return {
      sellerName: TOOL_SELLER_NAME,
      appearance: TOOL_SELLER_APPEARANCE,
      position: this.position,
      rotationY: this.rotationY,
      counter: this.counter,
      signText: TOOL_SIGN_TEXT,
    };
  }
}
