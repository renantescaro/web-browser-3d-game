// O cenário que o servidor manda no `welcome`: árvores, praça, comerciante, Tiro ao Alvo e
// loja de roupas. Monta tudo de uma vez e recarrega ao reconectar.
import type * as THREE from "three";
import type { WelcomeMessage } from "@jogo/shared/protocol";
import { ClothingShopManager } from "./ClothingShopManager";
import { MerchantManager } from "./MerchantManager";
import type { Physics } from "./Physics";
import { ShootingBoothManager } from "./ShootingBoothManager";
import { SquareManager } from "./SquareManager";
import { TreesManager } from "./TreesManager";

export class Scenery {
  readonly trees: TreesManager;
  readonly square: SquareManager;
  readonly merchant: MerchantManager;
  readonly shootingBooth: ShootingBoothManager;
  readonly clothingShop: ClothingShopManager;

  constructor(physics: Physics, scene: THREE.Scene) {
    this.trees = new TreesManager(physics, scene);
    this.square = new SquareManager(physics, scene);
    this.merchant = new MerchantManager(physics, scene);
    this.shootingBooth = new ShootingBoothManager(physics, scene);
    this.clothingShop = new ClothingShopManager(physics, scene);
  }

  /** Substitui o cenário atual (no reconectar, o servidor pode ter reiniciado). */
  load(welcome: WelcomeMessage): void {
    this.trees.load(welcome.trees);
    this.square.load(welcome.square);
    this.merchant.load(welcome.merchant);
    this.shootingBooth.load(welcome.shootingBooth);
    this.clothingShop.load(welcome.clothingShop);
  }

  /** Animações decorativas: peixes, NPCs e patos. */
  update(dt: number): void {
    this.square.update(dt);
    this.merchant.update(dt);
    this.shootingBooth.update(dt);
    this.clothingShop.update(dt);
  }

  clear(): void {
    this.trees.clear();
    this.square.clear();
    this.merchant.clear();
    this.shootingBooth.clear();
    this.clothingShop.clear();
  }
}
