// Tudo o que o botão de Ação faz além de bater: comerciante, loja de roupas, Tiro ao Alvo,
// dar peixe e pesca. Monta os controladores, liga-os à HUD e decide quem fica com a Ação.
import type * as THREE from "three";
import type { PlayerSnapshot, WelcomeMessage } from "@jogo/shared/protocol";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import type { Hud } from "../ui/Hud";
import { ACTION_LABELS, ActionResolver } from "./ActionResolver";
import type { AnimalsManager } from "./AnimalsManager";
import { ClothingController } from "./ClothingController";
import type { ClothingShopManager } from "./ClothingShopManager";
import { FeedingController } from "./FeedingController";
import { FishingController } from "./FishingController";
import type { Input, Intents } from "./Input";
import { MerchantController } from "./MerchantController";
import type { MerchantManager } from "./MerchantManager";
import type { ShootingBoothManager } from "./ShootingBoothManager";
import { ShootingController } from "./ShootingController";
import type { SquareManager } from "./SquareManager";
import type { ThirdPersonCamera } from "./ThirdPersonCamera";
import type { TouchControls } from "./TouchControls";

export interface InteractionDeps {
  container: HTMLElement;
  touchMode: boolean;
  local: LocalPlayer;
  camera: ThirdPersonCamera;
  view: THREE.PerspectiveCamera;
  network: Network;
  hud: Hud;
  input: Input;
  touch: TouchControls | null;
  square: SquareManager;
  animals: AnimalsManager;
  merchantManager: MerchantManager;
  shootingBooth: ShootingBoothManager;
  clothingShop: ClothingShopManager;
  selfId: () => string;
}

export class Interactions {
  /** Também guarda a contagem de peixes (o inventário de peixes). */
  readonly fishing: FishingController;
  /** Também guarda o dinheiro do jogador. */
  readonly merchant: MerchantController;
  readonly shooting: ShootingController;
  /** Também guarda as roupas que o jogador veste. */
  readonly clothing: ClothingController;
  private readonly actions: ActionResolver;

  constructor(d: InteractionDeps) {
    this.fishing = new FishingController(d.container, d.touchMode, d.local, d.square, d.network);
    const fishCount = () => this.fishing.fishCount;
    this.merchant = new MerchantController(d.container, d.touchMode, d.local, d.merchantManager, d.network, fishCount);
    const balance = () => this.merchant.balance;
    this.clothing = new ClothingController(d.container, d.touchMode, d.local, d.clothingShop, d.network, balance);
    this.shooting = new ShootingController(
      d.container,
      d.touchMode,
      d.local,
      d.shootingBooth,
      d.camera,
      d.view,
      d.network,
      balance,
    );
    const feeding = new FeedingController(d.local, d.animals, d.network, fishCount, d.selfId);

    // Prioridade da Ação: Negociar, Comprar roupas, Jogar, Dar peixe, Pescar e, se nada servir, Bater.
    this.actions = new ActionResolver([this.merchant, this.clothing, this.shooting, feeding, this.fishing]);
    this.actions.onLabel = (label) => {
      d.hud.setAction(label);
      d.touch?.setActionLabel(label);
    };
    d.hud.setAction(ACTION_LABELS.punch);

    this.fishing.onCount = (count) => {
      d.hud.setFishCount(count);
      this.merchant.refresh();
    };
    this.merchant.onOpen = () => d.input.releasePointerLock();
    this.clothing.onOpen = () => d.input.releasePointerLock();
    this.merchant.onMoney = (amount) => {
      d.hud.setMoney(amount);
      this.clothing.refresh();
    };
    this.shooting.onNotice = (text) => d.hud.notify(text);
  }

  /** Rótulo atual do botão de Ação. */
  get label(): string {
    return this.actions.label;
  }

  /** Parado numa atividade (pescando ou mirando): o jogador não anda nem pula. */
  get busy(): boolean {
    return this.fishing.active || this.shooting.active;
  }

  /** Estado vindo do servidor no `welcome` (também ao reconectar): fecha tudo e recarrega. */
  reset(welcome: WelcomeMessage): void {
    this.fishing.stop();
    this.merchant.close();
    this.clothing.close();
    this.shooting.stop();
    this.merchant.setStock(welcome.merchant.stock);
    const self: PlayerSnapshot | undefined = welcome.players.find((p) => p.id === welcome.selfId);
    if (!self) return;
    this.fishing.setCount(self.fishCaught);
    this.merchant.setMoney(self.money);
    this.clothing.setOutfit(self.outfit);
  }

  /** Chamar todo frame. Trata a Ação e retorna false se ela não foi usada (aí é bater). */
  update(dt: number, intents: Intents): boolean {
    this.merchant.update(intents);
    this.clothing.update(intents);
    this.fishing.update(dt, intents);
    this.shooting.update(dt, intents);
    const used = intents.action && this.actions.handle();
    this.actions.update();
    return used;
  }

  dispose(): void {
    this.fishing.dispose();
    this.merchant.dispose();
    this.clothing.dispose();
    this.shooting.dispose();
  }
}
