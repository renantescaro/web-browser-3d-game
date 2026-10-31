// Painel do comerciante: dinheiro e itens do jogador, estoque e botões de comprar/vender.
import { inventoryItem } from "@jogo/shared/inventory";
import { ITEM_IDS, ITEMS, type ItemId } from "@jogo/shared/items";
import type { MerchantStock, TradeAction } from "@jogo/shared/protocol";
import { formatMoney, shopButton } from "./shopUi";

/** O que o painel mostra; os botões ficam desabilitados quando o negócio não é possível. */
export interface MerchantView {
  merchantName: string;
  stock: MerchantStock;
  money: number;
  owned: (item: ItemId) => number;
  /** Cabe mais uma unidade no inventário? */
  room: (item: ItemId) => boolean;
}

interface ItemRow {
  stock: HTMLElement;
  buy: HTMLButtonElement;
  sell: HTMLButtonElement;
}

export class MerchantPanel {
  private readonly root = document.createElement("div");
  private readonly name = document.createElement("span");
  private readonly wallet = document.createElement("div");
  private readonly rows = new Map<ItemId, ItemRow>();
  /** Clique em comprar/vender. */
  onTrade: ((item: ItemId, action: TradeAction) => void) | null = null;
  /** Clique em "Sair". */
  onExit: (() => void) | null = null;

  constructor(container: HTMLElement, touchMode: boolean) {
    this.root.className = "shop-panel";
    this.root.dataset.testid = "merchant-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "shop-title";
    title.textContent = "🧺 Comerciante ";
    this.name.className = "shop-name";
    title.appendChild(this.name);

    this.wallet.className = "shop-wallet";
    this.wallet.dataset.testid = "merchant-wallet";

    const list = document.createElement("div");
    list.className = "shop-items";
    for (const id of ITEM_IDS) list.appendChild(this.createRow(id));

    const exit = shopButton("shop-exit", touchMode ? "Sair" : "Sair (Q)", () => this.onExit?.());
    exit.dataset.testid = "merchant-exit";

    this.root.append(title, this.wallet, list, exit);
    container.appendChild(this.root);
  }

  private createRow(id: ItemId): HTMLElement {
    const item = { ...ITEMS[id], ...inventoryItem(id) };
    const row = document.createElement("div");
    row.className = "shop-item";
    const label = document.createElement("span");
    label.className = "shop-item-name";
    label.textContent = `${item.emoji} ${item.name}`;
    const stock = document.createElement("span");
    stock.className = "shop-item-info";
    stock.dataset.testid = `merchant-stock-${id}`;
    const buy = shopButton("shop-buy", `Comprar ${formatMoney(item.price.buy)}`, () => this.onTrade?.(id, "buy"));
    buy.dataset.testid = `merchant-buy-${id}`;
    const sell = shopButton("shop-sell", `Vender ${formatMoney(item.price.sell)}`, () => this.onTrade?.(id, "sell"));
    sell.dataset.testid = `merchant-sell-${id}`;
    row.append(label, stock, buy, sell);
    this.rows.set(id, { stock, buy, sell });
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

  render(view: MerchantView): void {
    this.name.textContent = `· ${view.merchantName}`;
    const owned = ITEM_IDS.map((id) => `${inventoryItem(id).emoji} ${view.owned(id)}`).join(" · ");
    const full = ITEM_IDS.every((id) => !view.room(id));
    this.wallet.textContent = `Você tem 💰 ${formatMoney(view.money)} · ${owned}${full ? " · 🎒 Inventário cheio" : ""}`;
    for (const [id, row] of this.rows) {
      const { price, stock } = ITEMS[id];
      const inStock = view.stock[id];
      row.stock.textContent = `Estoque: ${inStock}`;
      row.buy.disabled = inStock <= 0 || view.money < price.buy || !view.room(id);
      row.sell.disabled = view.owned(id) <= 0 || inStock >= stock.max;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
