import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import { PLAYER_HEIGHT, PLAYER_RADIUS } from "@jogo/shared/constants";
import { localToWorldXZ } from "@jogo/shared/math";
import type { LumberMillData } from "@jogo/shared/protocol";
import { Character } from "../entities/Character";
import { LumberStall } from "../entities/lumber/LumberStall";
import type { Physics } from "./Physics";

/** Reação que o Brenno mostra a cada compra de madeira (para todos verem). */
const PURCHASE_REACTION = "🪵";

interface Built {
  data: LumberMillData;
  buyer: Character;
  stall: LumberStall;
  colliders: RAPIER.Collider[];
}

/** Monta a madeireira recebida no `welcome` (Brenno, balcão, toras, serra e colisores). */
export class LumberMillManager {
  private built: Built | null = null;

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui a madeireira atual (no reconectar, o servidor pode ter reiniciado). */
  load(data: LumberMillData): void {
    this.clear();
    const buyer = new Character(data.buyerName, data.appearance);
    buyer.root.position.set(data.position.x, 0, data.position.z);
    buyer.root.rotation.y = data.rotationY;

    const stall = new LumberStall(data.signText);
    stall.root.position.set(data.counter.x, 0, data.counter.z);
    stall.root.rotation.y = data.rotationY;

    const pile = localToWorldXZ(data.counter, data.rotationY, 0, LumberStall.PILE_BOX.z);
    const saw = localToWorldXZ(data.counter, data.rotationY, LumberStall.SAW_BOX.x, LumberStall.SAW_BOX.z);
    const colliders = [
      this.physics.createStaticBox(data.counter.x, data.counter.z, { ...LumberStall.HALF_EXTENTS }, data.rotationY),
      this.physics.createStaticBox(pile.x, pile.z, { ...LumberStall.PILE_BOX.half }, data.rotationY),
      this.physics.createStaticBox(saw.x, saw.z, { ...LumberStall.SAW_BOX.half }, data.rotationY),
      this.physics.createStaticCylinder(data.position.x, data.position.z, PLAYER_HEIGHT, PLAYER_RADIUS),
    ];
    this.scene.add(buyer.root, stall.root);
    this.built = { data, buyer, stall, colliders };
  }

  get data(): LumberMillData | null {
    return this.built?.data ?? null;
  }

  /** Centro do balcão, ou null se a madeireira ainda não chegou. */
  counterPosition(): { x: number; z: number } | null {
    const c = this.built?.data.counter;
    return c ? { x: c.x, z: c.z } : null;
  }

  /** Alguém vendeu madeira: o Brenno comemora. */
  playPurchase(): void {
    this.built?.buyer.playReaction(PURCHASE_REACTION);
  }

  update(dt: number): void {
    this.built?.buyer.update(dt, "idle", 0);
  }

  clear(): void {
    if (!this.built) return;
    this.built.buyer.dispose();
    this.built.stall.dispose();
    for (const c of this.built.colliders) this.physics.removeCollider(c);
    this.built = null;
  }
}
