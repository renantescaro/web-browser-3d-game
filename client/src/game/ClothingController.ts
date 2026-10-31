// Comprar roupas com a Deendi: detecta se o jogador está de frente para o balcão, abre/fecha
// o painel, manda as compras ao servidor (que confere tudo) e veste o que ele confirmar.
import { CLOTHING_FACING_DEG, CLOTHING_SHOP_RANGE } from "@jogo/shared/constants";
import { distanceXZ, isFacingPoint } from "@jogo/shared/math";
import { isWearing, outfitItem, type Outfit, type OutfitItemId } from "@jogo/shared/outfits";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { ClothingPanel } from "../ui/ClothingPanel";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { ClothingShopManager } from "./ClothingShopManager";
import type { Intents } from "./Input";

/** Folga extra (m) antes de o painel fechar sozinho porque o jogador foi empurrado para longe. */
const LEAVE_SLACK = 0.8;

export interface ClothingDebugInfo {
  sellerName: string;
  signText: string;
  x: number;
  z: number;
  rotationY: number;
  counter: { x: number; z: number };
  outfit: Outfit;
  open: boolean;
}

export class ClothingController implements ActionHandler {
  /** Avisado ao abrir o painel (solta o mouse para dar para clicar nos botões). */
  onOpen: (() => void) | null = null;

  private readonly panel: ClothingPanel;
  private outfit: Outfit = {};

  constructor(
    container: HTMLElement,
    touchMode: boolean,
    private readonly local: LocalPlayer,
    private readonly shop: ClothingShopManager,
    private readonly network: Network,
    /** Dinheiro do jogador (guardado pelo `MerchantController`). */
    private readonly balance: () => number,
  ) {
    this.panel = new ClothingPanel(container, touchMode);
    this.panel.onExit = () => this.close();
    this.panel.onBuy = (item) => this.buy(item);
  }

  get active(): boolean {
    return this.panel.visible;
  }

  /** O jogador está de frente para o balcão, perto o bastante para comprar? */
  private canShop(): boolean {
    const counter = this.shop.counterPosition();
    if (!counter) return false;
    return isFacingPoint(this.local.renderPosition, this.local.rotationY, counter, CLOTHING_SHOP_RANGE, CLOTHING_FACING_DEG);
  }

  actionLabel(): ActionLabel | null {
    if (this.active) return ACTION_LABELS.closeTrade;
    return this.canShop() ? ACTION_LABELS.clothes : null;
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
    const far = !counter || distanceXZ(this.local.renderPosition, counter) > CLOTHING_SHOP_RANGE + LEAVE_SLACK;
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

  /** Roupas vindas do servidor (welcome ou `outfit`): o jogador passa a vesti-las. */
  setOutfit(outfit: Outfit): void {
    this.outfit = { ...outfit };
    this.local.character.setOutfit(this.outfit);
    this.network.rememberOutfit(this.outfit);
    this.refresh();
  }

  /** Redesenha o painel aberto (ex.: o dinheiro mudou). */
  refresh(): void {
    if (!this.active) return;
    this.panel.render({ sellerName: this.shop.data?.sellerName ?? "", money: this.balance(), outfit: this.outfit });
  }

  /** O servidor confere e responde com `money` e `outfit`. */
  private buy(item: OutfitItemId): void {
    if (isWearing(this.outfit, item) || this.balance() < outfitItem(item).price) return;
    this.network.buyOutfit(item);
  }

  debugInfo(): ClothingDebugInfo | null {
    const data = this.shop.data;
    if (!data) return null;
    return {
      sellerName: data.sellerName,
      signText: data.signText,
      x: data.position.x,
      z: data.position.z,
      rotationY: data.rotationY,
      counter: { x: data.counter.x, z: data.counter.z },
      outfit: { ...this.outfit },
      open: this.active,
    };
  }

  dispose(): void {
    this.panel.dispose();
  }
}
