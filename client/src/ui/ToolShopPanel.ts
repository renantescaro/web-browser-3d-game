// Painel da loja de ferramentas: as ferramentas à venda e quantas o jogador já carrega
// (no máximo `MAX_TOOLS`, e só se houver espaço no inventário).
import { inventoryItem } from "@jogo/shared/inventory";
import { MAX_TOOLS, TOOL_IDS, toolInfo, type ToolId } from "@jogo/shared/tools";
import { formatMoney, shopButton } from "./shopUi";

/** O que o painel mostra; o botão fica desabilitado quando não dá para comprar. */
export interface ToolShopView {
  sellerName: string;
  money: number;
  /** Emoji de cada ferramenta carregada. */
  tools: readonly string[];
  owned: (item: ToolId) => number;
  /** Cabe mais uma no inventário (espaço livre e menos de `MAX_TOOLS` ferramentas)? */
  room: (item: ToolId) => boolean;
}

interface ItemRow {
  status: HTMLElement;
  buy: HTMLButtonElement;
}

export class ToolShopPanel {
  private readonly root = document.createElement("div");
  private readonly name = document.createElement("span");
  private readonly wallet = document.createElement("div");
  private readonly rows = new Map<ToolId, ItemRow>();
  /** Clique em comprar. */
  onBuy: ((item: ToolId) => void) | null = null;
  /** Clique em "Sair". */
  onExit: (() => void) | null = null;

  constructor(container: HTMLElement, touchMode: boolean) {
    this.root.className = "shop-panel";
    this.root.dataset.testid = "tools-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "shop-title";
    title.textContent = "🧰 Ferramentas ";
    this.name.className = "shop-name";
    title.appendChild(this.name);

    this.wallet.className = "shop-wallet";
    this.wallet.dataset.testid = "tools-wallet";

    const list = document.createElement("div");
    list.className = "shop-items";
    for (const id of TOOL_IDS) list.appendChild(this.createRow(id));

    const exit = shopButton("shop-exit", touchMode ? "Sair" : "Sair (Q)", () => this.onExit?.());
    exit.dataset.testid = "tools-exit";

    this.root.append(title, this.wallet, list, exit);
    container.appendChild(this.root);
  }

  private createRow(id: ToolId): HTMLElement {
    const item = inventoryItem(id);
    const row = document.createElement("div");
    row.className = "shop-item shop-item--single";
    const label = document.createElement("span");
    label.className = "shop-item-name";
    label.textContent = `${item.emoji} ${item.name}`;
    const status = document.createElement("span");
    status.className = "shop-item-info";
    status.dataset.testid = `tools-status-${id}`;
    const buy = shopButton("shop-buy", "", () => this.onBuy?.(id));
    buy.dataset.testid = `tools-buy-${id}`;
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

  render(view: ToolShopView): void {
    this.name.textContent = `· ${view.sellerName}`;
    const carried = view.tools.length > 0 ? view.tools.join(" ") : "nenhuma";
    this.wallet.textContent = `Você tem 💰 ${formatMoney(view.money)} · Ferramentas: ${carried} (${view.tools.length}/${MAX_TOOLS})`;
    for (const [id, row] of this.rows) {
      const { price } = toolInfo(id);
      const owned = view.owned(id);
      const room = view.room(id);
      const reason = view.tools.length >= MAX_TOOLS ? `Máximo de ${MAX_TOOLS} ferramentas` : "🎒 Inventário cheio";
      row.status.textContent = !room ? reason : owned > 0 ? `Você tem ${owned}` : "";
      row.buy.textContent = `Comprar ${formatMoney(price)}`;
      row.buy.disabled = !room || view.money < price;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
