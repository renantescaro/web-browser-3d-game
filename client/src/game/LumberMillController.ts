// Vender madeira ao Brenno: detecta se o jogador está de frente para o balcão da madeireira,
// abre/fecha o painel e manda as vendas ao servidor (que confere tudo, paga e tira a madeira).
import { LUMBER_FACING_DEG, LUMBER_RANGE } from "@jogo/shared/constants";
import { distanceXZ, isFacingPoint } from "@jogo/shared/math";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { LumberMillPanel } from "../ui/LumberMillPanel";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { Intents } from "./Input";
import type { LumberMillManager } from "./LumberMillManager";
import type { PlayerInventory } from "./PlayerInventory";

/** Folga extra (m) antes de o painel fechar sozinho porque o jogador foi empurrado para longe. */
const LEAVE_SLACK = 0.8;

export interface LumberMillDebugInfo {
  buyerName: string;
  signText: string;
  x: number;
  z: number;
  rotationY: number;
  counter: { x: number; z: number };
  woodPrice: number;
  open: boolean;
}

export class LumberMillController implements ActionHandler {
  /** Avisado ao abrir o painel (solta o mouse para dar para clicar nos botões). */
  onOpen: (() => void) | null = null;

  private readonly panel: LumberMillPanel;

  constructor(
    container: HTMLElement,
    touchMode: boolean,
    private readonly local: LocalPlayer,
    private readonly mill: LumberMillManager,
    private readonly network: Network,
    /** Dinheiro do jogador (guardado pelo `MerchantController`). */
    private readonly balance: () => number,
    private readonly inventory: PlayerInventory,
  ) {
    this.panel = new LumberMillPanel(container, touchMode);
    this.panel.onExit = () => this.close();
    this.panel.onSell = (amount) => this.sell(amount);
  }

  get active(): boolean {
    return this.panel.visible;
  }

  /** O jogador está de frente para o balcão, perto o bastante para vender? */
  private canSell(): boolean {
    const counter = this.mill.counterPosition();
    if (!counter) return false;
    return isFacingPoint(this.local.renderPosition, this.local.rotationY, counter, LUMBER_RANGE, LUMBER_FACING_DEG);
  }

  actionLabel(): ActionLabel | null {
    if (this.active) return ACTION_LABELS.closeTrade;
    return this.canSell() ? ACTION_LABELS.sellWood : null;
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
    const counter = this.mill.counterPosition();
    const far = !counter || distanceXZ(this.local.renderPosition, counter) > LUMBER_RANGE + LEAVE_SLACK;
    if (intents.cancel || moving || far) this.close();
  }

  open(): void {
    const counter = this.mill.counterPosition();
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
    const data = this.mill.data;
    if (!this.active || !data) return;
    this.panel.render({
      buyerName: data.buyerName,
      money: this.balance(),
      wood: this.inventory.count("wood"),
      price: data.woodPrice,
    });
  }

  /** O servidor confere e responde com `money` e `inventory`. */
  private sell(amount: number): void {
    if (amount < 1 || this.inventory.count("wood") < amount) return;
    this.network.sellWood(amount);
  }

  debugInfo(): LumberMillDebugInfo | null {
    const data = this.mill.data;
    if (!data) return null;
    return {
      buyerName: data.buyerName,
      signText: data.signText,
      x: data.position.x,
      z: data.position.z,
      rotationY: data.rotationY,
      counter: { x: data.counter.x, z: data.counter.z },
      woodPrice: data.woodPrice,
      open: this.active,
    };
  }

  dispose(): void {
    this.panel.dispose();
  }
}
