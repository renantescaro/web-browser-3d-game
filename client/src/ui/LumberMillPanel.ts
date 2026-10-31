// Painel da madeireira: quanta madeira o jogador tem, quanto o Brenno paga e os botões de vender
// uma ou todas.
import { inventoryItem } from "@jogo/shared/inventory";
import { formatMoney, shopButton } from "./shopUi";

/** O que o painel mostra; os botões ficam desabilitados sem madeira. */
export interface LumberMillView {
  buyerName: string;
  money: number;
  wood: number;
  /** Quanto o Brenno paga por madeira (reais). */
  price: number;
}

export class LumberMillPanel {
  private readonly root = document.createElement("div");
  private readonly name = document.createElement("span");
  private readonly wallet = document.createElement("div");
  private readonly info = document.createElement("span");
  private readonly sellOne: HTMLButtonElement;
  private readonly sellAll: HTMLButtonElement;
  private readonly hint = document.createElement("div");
  /** Clique em vender (`amount` madeiras). */
  onSell: ((amount: number) => void) | null = null;
  /** Clique em "Sair". */
  onExit: (() => void) | null = null;
  private wood = 0;

  constructor(container: HTMLElement, touchMode: boolean) {
    this.root.className = "shop-panel";
    this.root.dataset.testid = "lumber-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "shop-title";
    title.textContent = "🪚 Madeireira ";
    this.name.className = "shop-name";
    title.appendChild(this.name);

    this.wallet.className = "shop-wallet";
    this.wallet.dataset.testid = "lumber-wallet";

    const { emoji, name } = inventoryItem("wood");
    const row = document.createElement("div");
    row.className = "shop-item";
    const label = document.createElement("span");
    label.className = "shop-item-name";
    label.textContent = `${emoji} ${name}`;
    this.info.className = "shop-item-info";
    this.info.dataset.testid = "lumber-price";
    this.sellOne = shopButton("shop-sell", "", () => this.onSell?.(1));
    this.sellOne.dataset.testid = "lumber-sell-one";
    this.sellAll = shopButton("shop-sell", "", () => this.onSell?.(this.wood));
    this.sellAll.dataset.testid = "lumber-sell-all";
    row.append(label, this.info, this.sellOne, this.sellAll);

    this.hint.className = "shop-item-info";
    this.hint.dataset.testid = "lumber-hint";

    const exit = shopButton("shop-exit", touchMode ? "Sair" : "Sair (Q)", () => this.onExit?.());
    exit.dataset.testid = "lumber-exit";

    const list = document.createElement("div");
    list.className = "shop-items";
    list.append(row, this.hint);
    this.root.append(title, this.wallet, list, exit);
    container.appendChild(this.root);
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

  render(view: LumberMillView): void {
    this.wood = view.wood;
    this.name.textContent = `· ${view.buyerName}`;
    this.wallet.textContent = `Você tem 💰 ${formatMoney(view.money)} · 🪵 ${view.wood}`;
    this.info.textContent = `${formatMoney(view.price)} cada`;
    this.sellOne.textContent = `Vender 1 ${formatMoney(view.price)}`;
    this.sellAll.textContent = `Vender tudo ${formatMoney(view.price * view.wood)}`;
    this.sellOne.disabled = view.wood <= 0;
    this.sellAll.disabled = view.wood <= 0;
    this.hint.textContent = view.wood > 0 ? "" : "Sem madeira. Corte árvores com um machado 🪓 (Gabriel vende).";
  }

  dispose(): void {
    this.root.remove();
  }
}
