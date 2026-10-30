// Painel do comerciante: dinheiro e itens do jogador, estoque e botões de comprar/vender.
import { ITEM_IDS, ITEMS, type ItemId } from "@jogo/shared/items";
import type { MerchantStock, TradeAction } from "@jogo/shared/protocol";

/** Dinheiro em reais (valores inteiros por enquanto). */
export function formatMoney(amount: number): string {
  return `R$ ${amount}`;
}

/** O que o painel mostra; os botões ficam desabilitados quando o negócio não é possível. */
export interface MerchantView {
  merchantName: string;
  stock: MerchantStock;
  money: number;
  owned: (item: ItemId) => number;
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
    this.root.className = "merchant-panel";
    this.root.dataset.testid = "merchant-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "merchant-title";
    title.textContent = "🧺 Comerciante ";
    this.name.className = "merchant-name";
    title.appendChild(this.name);

    this.wallet.className = "merchant-wallet";
    this.wallet.dataset.testid = "merchant-wallet";

    const list = document.createElement("div");
    list.className = "merchant-items";
    for (const id of ITEM_IDS) list.appendChild(this.createRow(id));

    const exit = this.button("merchant-exit", touchMode ? "Sair" : "Sair (Q)", () => this.onExit?.());
    exit.dataset.testid = "merchant-exit";

    this.root.append(title, this.wallet, list, exit);
    container.appendChild(this.root);
  }

  private createRow(id: ItemId): HTMLElement {
    const item = ITEMS[id];
    const row = document.createElement("div");
    row.className = "merchant-item";
    const label = document.createElement("span");
    label.className = "merchant-item-name";
    label.textContent = `${item.emoji} ${item.name}`;
    const stock = document.createElement("span");
    stock.className = "merchant-item-stock";
    stock.dataset.testid = `merchant-stock-${id}`;
    const buy = this.button("merchant-buy", `Comprar ${formatMoney(item.price.buy)}`, () => this.onTrade?.(id, "buy"));
    buy.dataset.testid = `merchant-buy-${id}`;
    const sell = this.button("merchant-sell", `Vender ${formatMoney(item.price.sell)}`, () => this.onTrade?.(id, "sell"));
    sell.dataset.testid = `merchant-sell-${id}`;
    row.append(label, stock, buy, sell);
    this.rows.set(id, { stock, buy, sell });
    return row;
  }

  private button(className: string, text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = text;
    b.addEventListener("click", () => {
      // Tira o foco para o Espaço (pular) não acionar o botão de novo.
      b.blur();
      onClick();
    });
    return b;
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
    const owned = ITEM_IDS.map((id) => `${ITEMS[id].emoji} ${view.owned(id)}`).join(" · ");
    this.wallet.textContent = `Você tem 💰 ${formatMoney(view.money)} · ${owned}`;
    for (const [id, row] of this.rows) {
      const { price, stock } = ITEMS[id];
      const inStock = view.stock[id];
      row.stock.textContent = `Estoque: ${inStock}`;
      row.buy.disabled = inStock <= 0 || view.money < price.buy;
      row.sell.disabled = view.owned(id) <= 0 || inStock >= stock.max;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
