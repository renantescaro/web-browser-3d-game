// Painel da loja de roupas: os itens agrupados por parte do corpo, com o botão de comprar.
// Cada parte do corpo aceita um item por vez: comprar outro da mesma parte troca o atual.
import {
  isWearing,
  itemsOfSlot,
  OUTFIT_ITEM_IDS,
  OUTFIT_SLOT_NAMES,
  OUTFIT_SLOTS,
  outfitItem,
  type Outfit,
  type OutfitItemId,
} from "@jogo/shared/outfits";
import { formatMoney, shopButton } from "./shopUi";

/** O que o painel mostra; o botão fica desabilitado quando não dá para comprar. */
export interface ClothingView {
  sellerName: string;
  money: number;
  outfit: Outfit;
}

interface ItemRow {
  status: HTMLElement;
  buy: HTMLButtonElement;
}

export class ClothingPanel {
  private readonly root = document.createElement("div");
  private readonly name = document.createElement("span");
  private readonly wallet = document.createElement("div");
  private readonly rows = new Map<OutfitItemId, ItemRow>();
  /** Clique em comprar (ou trocar). */
  onBuy: ((item: OutfitItemId) => void) | null = null;
  /** Clique em "Sair". */
  onExit: (() => void) | null = null;

  constructor(container: HTMLElement, touchMode: boolean) {
    this.root.className = "shop-panel";
    this.root.dataset.testid = "clothing-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "shop-title";
    title.textContent = "👗 Roupas e Acessórios ";
    this.name.className = "shop-name";
    title.appendChild(this.name);

    this.wallet.className = "shop-wallet";
    this.wallet.dataset.testid = "clothing-wallet";

    const list = document.createElement("div");
    list.className = "shop-items";
    for (const slot of OUTFIT_SLOTS) {
      const items = itemsOfSlot(slot);
      if (items.length === 0) continue;
      const header = document.createElement("div");
      header.className = "shop-group";
      header.textContent = items.length > 1 ? `${OUTFIT_SLOT_NAMES[slot]} (um por vez)` : OUTFIT_SLOT_NAMES[slot];
      list.appendChild(header);
      for (const id of items) list.appendChild(this.createRow(id));
    }

    const exit = shopButton("shop-exit", touchMode ? "Sair" : "Sair (Q)", () => this.onExit?.());
    exit.dataset.testid = "clothing-exit";

    this.root.append(title, this.wallet, list, exit);
    container.appendChild(this.root);
  }

  private createRow(id: OutfitItemId): HTMLElement {
    const item = outfitItem(id);
    const row = document.createElement("div");
    row.className = "shop-item shop-item--single";
    const label = document.createElement("span");
    label.className = "shop-item-name";
    label.textContent = `${item.emoji} ${item.name}`;
    const status = document.createElement("span");
    status.className = "shop-item-info";
    status.dataset.testid = `clothing-status-${id}`;
    const buy = shopButton("shop-buy", "", () => this.onBuy?.(id));
    buy.dataset.testid = `clothing-buy-${id}`;
    row.append(label, status, buy);
    this.rows.set(id, { status, buy });
    return row;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(view: ClothingView): void {
    this.name.textContent = `· ${view.sellerName}`;
    const worn = OUTFIT_ITEM_IDS.filter((id) => isWearing(view.outfit, id)).map((id) => outfitItem(id).emoji);
    this.wallet.textContent = `Você tem 💰 ${formatMoney(view.money)} · Vestindo: ${worn.length > 0 ? worn.join(" ") : "nada"}`;
    for (const [id, row] of this.rows) {
      const { price, slot } = outfitItem(id);
      const wearing = isWearing(view.outfit, id);
      const replaces = view.outfit[slot];
      row.status.textContent = wearing ? "Vestindo ✓" : replaces ? `no lugar de ${outfitItem(replaces).emoji}` : "";
      row.buy.textContent = wearing ? "Comprado" : `${replaces ? "Trocar" : "Comprar"} ${formatMoney(price)}`;
      row.buy.disabled = wearing || view.money < price;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
