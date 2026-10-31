import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import { PLAYER_HEIGHT, PLAYER_RADIUS } from "@jogo/shared/constants";
import { localToWorldXZ } from "@jogo/shared/math";
import type { ClothingShopData } from "@jogo/shared/protocol";
import { Character } from "../entities/Character";
import { ClothingStall } from "../entities/clothing/ClothingStall";
import type { Physics } from "./Physics";

/** Reação que a Deendi mostra a cada venda (para todos verem). */
const SALE_REACTION = "🛍️";

interface Built {
  data: ClothingShopData;
  seller: Character;
  stall: ClothingStall;
  colliders: RAPIER.Collider[];
}

/** Monta a loja de roupas recebida no `welcome` (Deendi, balcão, arara e colisores). */
export class ClothingShopManager {
  private built: Built | null = null;

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui a loja atual (no reconectar, o servidor pode ter reiniciado). */
  load(data: ClothingShopData): void {
    this.clear();
    const seller = new Character(data.sellerName, data.appearance);
    seller.root.position.set(data.position.x, 0, data.position.z);
    seller.root.rotation.y = data.rotationY;

    const stall = new ClothingStall(data.signText);
    stall.root.position.set(data.counter.x, 0, data.counter.z);
    stall.root.rotation.y = data.rotationY;

    const rack = localToWorldXZ(data.counter, data.rotationY, 0, ClothingStall.RACK_BOX.z);
    const colliders = [
      this.physics.createStaticBox(data.counter.x, data.counter.z, { ...ClothingStall.HALF_EXTENTS }, data.rotationY),
      this.physics.createStaticBox(rack.x, rack.z, { ...ClothingStall.RACK_BOX.half }, data.rotationY),
      this.physics.createStaticCylinder(data.position.x, data.position.z, PLAYER_HEIGHT, PLAYER_RADIUS),
    ];
    this.scene.add(seller.root, stall.root);
    this.built = { data, seller, stall, colliders };
  }

  get data(): ClothingShopData | null {
    return this.built?.data ?? null;
  }

  /** Centro do balcão, ou null se a loja ainda não chegou. */
  counterPosition(): { x: number; z: number } | null {
    const c = this.built?.data.counter;
    return c ? { x: c.x, z: c.z } : null;
  }

  /** Alguém comprou: a Deendi comemora. */
  playSale(): void {
    this.built?.seller.playReaction(SALE_REACTION);
  }

  update(dt: number): void {
    this.built?.seller.update(dt, "idle", 0);
  }

  clear(): void {
    if (!this.built) return;
    this.built.seller.dispose();
    this.built.stall.dispose();
    for (const c of this.built.colliders) this.physics.removeCollider(c);
    this.built = null;
  }
}
