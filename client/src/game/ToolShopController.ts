// Comprar ferramentas com o Gabriel: detecta se o jogador está de frente para a bancada, abre/fecha
// o painel e manda as compras ao servidor (que confere tudo e põe a ferramenta no inventário).
import { TOOL_FACING_DEG, TOOL_SHOP_RANGE } from "@jogo/shared/constants";
import { distanceXZ, isFacingPoint } from "@jogo/shared/math";
import { inventoryItem } from "@jogo/shared/inventory";
import { TOOL_IDS, toolInfo, type ToolId } from "@jogo/shared/tools";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { ToolShopPanel } from "../ui/ToolShopPanel";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { Intents } from "./Input";
import type { PlayerInventory } from "./PlayerInventory";
import type { ToolShopManager } from "./ToolShopManager";

/** Folga extra (m) antes de o painel fechar sozinho porque o jogador foi empurrado para longe. */
const LEAVE_SLACK = 0.8;

export interface ToolShopDebugInfo {
  sellerName: string;
  signText: string;
  x: number;
  z: number;
  rotationY: number;
  counter: { x: number; z: number };
  open: boolean;
}

export class ToolShopController implements ActionHandler {
  /** Avisado ao abrir o painel (solta o mouse para dar para clicar nos botões). */
  onOpen: (() => void) | null = null;

  private readonly panel: ToolShopPanel;

  constructor(
    container: HTMLElement,
    touchMode: boolean,
    private readonly local: LocalPlayer,
    private readonly shop: ToolShopManager,
    private readonly network: Network,
    /** Dinheiro do jogador (guardado pelo `MerchantController`). */
    private readonly balance: () => number,
    private readonly inventory: PlayerInventory,
  ) {
    this.panel = new ToolShopPanel(container, touchMode);
    this.panel.onExit = () => this.close();
    this.panel.onBuy = (item) => this.buy(item);
  }

  get active(): boolean {
    return this.panel.visible;
  }

  /** O jogador está de frente para a bancada, perto o bastante para comprar? */
  private canShop(): boolean {
    const counter = this.shop.counterPosition();
    if (!counter) return false;
    return isFacingPoint(this.local.renderPosition, this.local.rotationY, counter, TOOL_SHOP_RANGE, TOOL_FACING_DEG);
  }

  actionLabel(): ActionLabel | null {
    if (this.active) return ACTION_LABELS.closeTrade;
    return this.canShop() ? ACTION_LABELS.tools : null;
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
    const counter = this.shop.counterPosition();
    const far = !counter || distanceXZ(this.local.renderPosition, counter) > TOOL_SHOP_RANGE + LEAVE_SLACK;
    if (intents.cancel || moving || far) this.close();
  }

  open(): void {
    const counter = this.shop.counterPosition();
    if (counter) this.local.faceTowards(counter.x, counter.z);
    this.panel.show();
    this.refresh();
    this.onOpen?.();
  }

  close(): void {
    this.panel.hide();
  }

  /** Redesenha o painel aberto (ex.: o dinheiro ou o inventário mudou). */
  refresh(): void {
    if (!this.active) return;
    const tools = TOOL_IDS.flatMap((id) => Array<string>(this.inventory.count(id)).fill(inventoryItem(id).emoji));
    this.panel.render({
      sellerName: this.shop.data?.sellerName ?? "",
      money: this.balance(),
      tools,
      owned: (item) => this.inventory.count(item),
      room: (item) => this.inventory.canAdd(item),
    });
  }

  /** O servidor confere e responde com `money` e `inventory`. */
  private buy(item: ToolId): void {
    if (!this.inventory.canAdd(item) || this.balance() < toolInfo(item).price) return;
    this.network.buyTool(item);
  }

  debugInfo(): ToolShopDebugInfo | null {
    const data = this.shop.data;
    if (!data) return null;
    return {
      sellerName: data.sellerName,
      signText: data.signText,
      x: data.position.x,
      z: data.position.z,
      rotationY: data.rotationY,
      counter: { x: data.counter.x, z: data.counter.z },
      open: this.active,
    };
  }

  dispose(): void {
    this.panel.dispose();
  }
}
