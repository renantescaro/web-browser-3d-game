// Tudo o que o botão de Ação faz além de bater: comerciante, loja de roupas, loja de ferramentas, madeireira, Tiro ao Alvo,
// cortar árvore,
// dar peixe e pesca. Monta os controladores, liga-os à HUD e decide quem fica com a Ação.
import type * as THREE from "three";
import type { PlayerSnapshot, WelcomeMessage } from "@jogo/shared/protocol";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import type { Hud } from "../ui/Hud";
import { ACTION_LABELS, ActionResolver } from "./ActionResolver";
import type { AnimalsManager } from "./AnimalsManager";
import { ChoppingController } from "./ChoppingController";
import { ClothingController } from "./ClothingController";
import type { ClothingShopManager } from "./ClothingShopManager";
import { FeedingController } from "./FeedingController";
import { FishingController } from "./FishingController";
import type { Input, Intents } from "./Input";
import { LumberMillController } from "./LumberMillController";
import type { LumberMillManager } from "./LumberMillManager";
import { MerchantController } from "./MerchantController";
import type { MerchantManager } from "./MerchantManager";
import { PlayerInventory } from "./PlayerInventory";
import type { ShootingBoothManager } from "./ShootingBoothManager";
import { ShootingController } from "./ShootingController";
import type { SquareManager } from "./SquareManager";
import type { ThirdPersonCamera } from "./ThirdPersonCamera";
import { ToolShopController } from "./ToolShopController";
import type { ToolShopManager } from "./ToolShopManager";
import type { TreesManager } from "./TreesManager";
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
  toolShop: ToolShopManager;
  trees: TreesManager;
  lumberMill: LumberMillManager;
  selfId: () => string;
}

export class Interactions {
  /** Tudo o que o jogador carrega (peixes, madeira, ferramentas). */
  readonly inventory: PlayerInventory;
  readonly fishing: FishingController;
  readonly chopping: ChoppingController;
  /** Também guarda o dinheiro do jogador. */
  readonly merchant: MerchantController;
  readonly shooting: ShootingController;
  /** Também guarda as roupas que o jogador veste. */
  readonly clothing: ClothingController;
  readonly tools: ToolShopController;
  readonly lumber: LumberMillController;
  private readonly actions: ActionResolver;

  constructor(d: InteractionDeps) {
    const inventory = new PlayerInventory(d.network);
    this.inventory = inventory;
    this.fishing = new FishingController(d.container, d.touchMode, d.local, d.square, d.network, inventory);
    this.chopping = new ChoppingController(d.container, d.touchMode, d.local, d.trees, d.network, inventory);
    this.merchant = new MerchantController(d.container, d.touchMode, d.local, d.merchantManager, d.network, inventory);
    const balance = () => this.merchant.balance;
    this.clothing = new ClothingController(d.container, d.touchMode, d.local, d.clothingShop, d.network, balance);
    this.tools = new ToolShopController(d.container, d.touchMode, d.local, d.toolShop, d.network, balance, inventory);
    this.lumber = new LumberMillController(d.container, d.touchMode, d.local, d.lumberMill, d.network, balance, inventory);
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
    const feeding = new FeedingController(d.local, d.animals, d.network, () => inventory.count("fish"), d.selfId);

    // Prioridade da Ação: Negociar, Comprar roupas, Comprar ferramentas, Vender madeira, Jogar, Dar
    // peixe, Cortar árvore, Pescar e, se nada servir, Bater.
    this.actions = new ActionResolver([
      this.merchant,
      this.clothing,
      this.tools,
      this.lumber,
      this.shooting,
      feeding,
      this.chopping,
      this.fishing,
    ]);
    this.actions.onLabel = (label) => {
      d.hud.setAction(label);
      d.touch?.setActionLabel(label);
    };
    d.hud.setAction(ACTION_LABELS.punch);

    inventory.onChange((items) => {
      d.hud.setInventory(items);
      this.merchant.refresh();
      this.tools.refresh();
      this.lumber.refresh();
    });
    this.merchant.onOpen = () => d.input.releasePointerLock();
    this.clothing.onOpen = () => d.input.releasePointerLock();
    this.tools.onOpen = () => d.input.releasePointerLock();
    this.lumber.onOpen = () => d.input.releasePointerLock();
    this.merchant.onMoney = (amount) => {
      d.hud.setMoney(amount);
      this.clothing.refresh();
      this.tools.refresh();
      this.lumber.refresh();
    };
    const notify = (text: string) => d.hud.notify(text);
    this.shooting.onNotice = notify;
    this.fishing.onNotice = notify;
    this.chopping.onNotice = notify;
  }

  /** Rótulo atual do botão de Ação. */
  get label(): string {
    return this.actions.label;
  }

  /** Parado numa atividade (pescando, mirando ou cortando): o jogador não anda nem pula. */
  get busy(): boolean {
    return this.fishing.active || this.shooting.active || this.chopping.active;
  }

  /** Estado vindo do servidor no `welcome` (também ao reconectar): fecha tudo e recarrega. */
  reset(welcome: WelcomeMessage): void {
    this.fishing.stop();
    this.chopping.stop();
    this.merchant.close();
    this.clothing.close();
    this.tools.close();
    this.lumber.close();
    this.shooting.stop();
    this.merchant.setStock(welcome.merchant.stock);
    const self: PlayerSnapshot | undefined = welcome.players.find((p) => p.id === welcome.selfId);
    if (!self) return;
    this.inventory.set(self.inventory);
    this.merchant.setMoney(self.money);
    this.clothing.setOutfit(self.outfit);
  }

  /** Chamar todo frame. Trata a Ação e retorna false se ela não foi usada (aí é bater). */
  update(dt: number, intents: Intents): boolean {
    this.merchant.update(intents);
    this.clothing.update(intents);
    this.tools.update(intents);
    this.lumber.update(intents);
    this.fishing.update(dt, intents);
    this.chopping.update(dt, intents);
    this.shooting.update(dt, intents);
    const used = intents.action && this.actions.handle();
    this.actions.update();
    return used;
  }

  dispose(): void {
    this.fishing.dispose();
    this.chopping.dispose();
    this.merchant.dispose();
    this.clothing.dispose();
    this.tools.dispose();
    this.lumber.dispose();
    this.shooting.dispose();
  }
}
