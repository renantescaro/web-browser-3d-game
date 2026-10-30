import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import { PLAYER_HEIGHT, PLAYER_RADIUS } from "@jogo/shared/constants";
import type { MerchantData } from "@jogo/shared/protocol";
import { Character } from "../entities/Character";
import { MerchantStall } from "../entities/merchant/MerchantStall";
import type { Physics } from "./Physics";

/** Reação que o comerciante mostra a cada negócio fechado (para todos verem). */
const TRADE_REACTION = "💰";

interface Built {
  data: MerchantData;
  character: Character;
  stall: MerchantStall;
  colliders: RAPIER.Collider[];
}

/** Monta o comerciante recebido no `welcome` (personagem, barraca e colisores). */
export class MerchantManager {
  private built: Built | null = null;

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui o comerciante atual (no reconectar, o servidor pode ter reiniciado). */
  load(data: MerchantData): void {
    this.clear();
    const character = new Character(data.name, data.appearance);
    character.root.position.set(data.position.x, 0, data.position.z);
    character.root.rotation.y = data.rotationY;

    const stall = new MerchantStall(data.signText);
    stall.root.position.set(data.table.x, 0, data.table.z);
    stall.root.rotation.y = data.rotationY;

    const colliders = [
      this.physics.createStaticBox(data.table.x, data.table.z, { ...MerchantStall.HALF_EXTENTS }, data.rotationY),
      this.physics.createStaticCylinder(data.position.x, data.position.z, PLAYER_HEIGHT, PLAYER_RADIUS),
    ];
    this.scene.add(character.root, stall.root);
    this.built = { data, character, stall, colliders };
  }

  get data(): MerchantData | null {
    return this.built?.data ?? null;
  }

  /** Centro da mesa, ou null se o comerciante ainda não chegou. */
  tablePosition(): { x: number; z: number } | null {
    const t = this.built?.data.table;
    return t ? { x: t.x, z: t.z } : null;
  }

  /** Alguém negociou: o comerciante comemora. */
  playTrade(): void {
    this.built?.character.playReaction(TRADE_REACTION);
  }

  update(dt: number): void {
    this.built?.character.update(dt, "idle", 0);
  }

  clear(): void {
    if (!this.built) return;
    this.built.character.dispose();
    this.built.stall.dispose();
    for (const c of this.built.colliders) this.physics.removeCollider(c);
    this.built = null;
  }
}
