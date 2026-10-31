// O comerciante: uma barraca do lado de fora da praça, com estoque próprio de cada item.
import {
  MERCHANT_APPEARANCE,
  MERCHANT_NAME,
  MERCHANT_SIGN_TEXT,
  MERCHANT_SQUARE_GAP,
  MERCHANT_TABLE_OFFSET,
  SQUARE_RADIUS,
} from "@jogo/shared/constants";
import { ITEM_IDS, ITEMS, type ItemId } from "@jogo/shared/items";
import { forwardFromYaw, wrapAngle } from "@jogo/shared/math";
import type { MerchantData, MerchantStock, SquareData, Vec3 } from "@jogo/shared/protocol";
import { signSides } from "./Square.js";

/** Raio (m) em volta do comerciante onde não nascem árvores. */
export const MERCHANT_CLEAR_RADIUS = 4;

export class Merchant {
  readonly position: Vec3;
  readonly rotationY: number;
  readonly table: Vec3;
  private readonly stock: MerchantStock;

  constructor(square: SquareData) {
    // No lado mais largo da placa: nenhum banco fica entre a fonte e a mesa.
    const angle = signSides(square).wide;
    const dist = SQUARE_RADIUS + MERCHANT_SQUARE_GAP;
    this.position = {
      x: square.position.x + Math.sin(angle) * dist,
      y: 0,
      z: square.position.z + Math.cos(angle) * dist,
    };
    // Olha para o centro da praça; a mesa fica entre ele e os clientes.
    this.rotationY = wrapAngle(angle + Math.PI);
    const forward = forwardFromYaw(this.rotationY);
    this.table = {
      x: this.position.x + forward.x * MERCHANT_TABLE_OFFSET,
      y: 0,
      z: this.position.z + forward.z * MERCHANT_TABLE_OFFSET,
    };
    this.stock = Object.fromEntries(ITEM_IDS.map((id) => [id, ITEMS[id].stock.initial])) as MerchantStock;
  }

  stockSnapshot(): MerchantStock {
    return { ...this.stock };
  }

  /** Tem o item para vender ao jogador? */
  hasStock(item: ItemId): boolean {
    return this.stock[item] > 0;
  }

  /** Ainda cabe o item no estoque, para comprar do jogador? */
  hasRoom(item: ItemId): boolean {
    return this.stock[item] < ITEMS[item].stock.max;
  }

  /** Tira (-1, vendeu ao jogador) ou põe (+1, comprou dele) unidades no estoque. */
  changeStock(item: ItemId, delta: number): void {
    this.stock[item] = Math.max(0, Math.min(ITEMS[item].stock.max, this.stock[item] + delta));
  }

  toData(): MerchantData {
    return {
      name: MERCHANT_NAME,
      appearance: MERCHANT_APPEARANCE,
      position: this.position,
      rotationY: this.rotationY,
      table: this.table,
      signText: MERCHANT_SIGN_TEXT,
      stock: this.stockSnapshot(),
    };
  }
}
