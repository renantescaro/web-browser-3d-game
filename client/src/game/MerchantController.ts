// Negociar com o comerciante: detecta se o jogador está de frente para a mesa, abre/fecha
// o painel e manda as compras e vendas ao servidor (que confere tudo e responde).
import { MERCHANT_FACING_DEG, MERCHANT_TRADE_RANGE } from "@jogo/shared/constants";
import { ITEM_IDS, ITEMS, type ItemId } from "@jogo/shared/items";
import { distanceXZ, isFacingPoint } from "@jogo/shared/math";
import type { MerchantStock, TradeAction } from "@jogo/shared/protocol";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { MerchantPanel } from "../ui/MerchantPanel";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { Intents } from "./Input";
import type { MerchantManager } from "./MerchantManager";

/** Folga extra (m) antes de o painel fechar sozinho porque o jogador foi empurrado para longe. */
const LEAVE_SLACK = 0.8;

export interface MerchantDebugInfo {
  name: string;
  signText: string;
  x: number;
  z: number;
  rotationY: number;
  table: { x: number; z: number };
  stock: Record<string, number>;
  money: number;
  open: boolean;
}

export class MerchantController implements ActionHandler {
  /** Avisado quando o dinheiro muda. */
  onMoney: ((amount: number) => void) | null = null;
  /** Avisado ao abrir o painel (o `Game` solta o mouse para dar para clicar nos botões). */
  onOpen: (() => void) | null = null;

  private readonly panel: MerchantPanel;
  private stock = Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as MerchantStock;
  private money = 0;

  constructor(
    container: HTMLElement,
    touchMode: boolean,
    private readonly local: LocalPlayer,
    private readonly merchant: MerchantManager,
    private readonly network: Network,
    /** Quanto o jogador tem de cada item (o peixe vem do `FishingController`). */
    private readonly owned: (item: ItemId) => number,
  ) {
    this.panel = new MerchantPanel(container, touchMode);
    this.panel.onExit = () => this.close();
    this.panel.onTrade = (item, action) => this.trade(item, action);
  }

  get active(): boolean {
    return this.panel.visible;
  }

  get balance(): number {
    return this.money;
  }

  /** O jogador está de frente para a mesa, perto o bastante para negociar? */
  private canTrade(): boolean {
    const table = this.merchant.tablePosition();
    if (!table) return false;
    const p = this.local.renderPosition;
    return isFacingPoint(p, this.local.rotationY, table, MERCHANT_TRADE_RANGE, MERCHANT_FACING_DEG);
  }

  actionLabel(): ActionLabel | null {
    if (this.active) return ACTION_LABELS.closeTrade;
    return this.canTrade() ? ACTION_LABELS.trade : null;
  }

  /** Abre o painel ou, se já estiver aberto, fecha. */
  act(): void {
    if (this.active) this.close();
    else this.open();
  }

  /** Chamar todo frame: fecha o painel se o jogador sair, andar ou for empurrado. */
  update(intents: Intents): void {
    if (!this.active) return;
    const moving = intents.moveX !== 0 || intents.moveZ !== 0 || intents.jump;
    const table = this.merchant.tablePosition();
    const far = !table || distanceXZ(this.local.renderPosition, table) > MERCHANT_TRADE_RANGE + LEAVE_SLACK;
    if (intents.cancel || moving || far) this.close();
  }

  open(): void {
    const table = this.merchant.tablePosition();
    if (table) this.local.faceTowards(table.x, table.z);
    this.panel.show();
    this.refresh();
    this.onOpen?.();
  }

  close(): void {
    this.panel.hide();
  }

  /** Estoque vindo do servidor (welcome ou `merchantStock`). */
  setStock(stock: MerchantStock): void {
    this.stock = { ...stock };
    this.refresh();
  }

  /** Dinheiro vindo do servidor (welcome ou `money`). */
  setMoney(amount: number): void {
    this.money = amount;
    this.network.rememberMoney(amount);
    this.onMoney?.(amount);
    this.refresh();
  }

  /** Redesenha o painel aberto (ex.: a contagem de peixes mudou). */
  refresh(): void {
    if (!this.active) return;
    this.panel.render({
      merchantName: this.merchant.data?.name ?? "",
      stock: this.stock,
      money: this.money,
      owned: this.owned,
    });
  }

  /** O servidor confere e responde com `fishCount`, `money` e `merchantStock`. */
  private trade(item: ItemId, action: TradeAction): void {
    const { price } = ITEMS[item];
    if (action === "buy" && (this.stock[item] <= 0 || this.money < price.buy)) return;
    if (action === "sell" && this.owned(item) <= 0) return;
    this.network.trade(item, action);
  }

  debugInfo(): MerchantDebugInfo | null {
    const data = this.merchant.data;
    if (!data) return null;
    return {
      name: data.name,
      signText: data.signText,
      x: data.position.x,
      z: data.position.z,
      rotationY: data.rotationY,
      table: { x: data.table.x, z: data.table.z },
      stock: { ...this.stock },
      money: this.money,
      open: this.active,
    };
  }

  dispose(): void {
    this.panel.dispose();
  }
}
