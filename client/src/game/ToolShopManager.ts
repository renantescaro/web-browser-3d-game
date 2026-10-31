import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import { PLAYER_HEIGHT, PLAYER_RADIUS } from "@jogo/shared/constants";
import { localToWorldXZ } from "@jogo/shared/math";
import type { ToolShopData } from "@jogo/shared/protocol";
import { Character } from "../entities/Character";
import { ToolStall } from "../entities/tools/ToolStall";
import type { Physics } from "./Physics";

/** Reação que o Gabriel mostra a cada venda (para todos verem). */
const SALE_REACTION = "🔨";

interface Built {
  data: ToolShopData;
  seller: Character;
  stall: ToolStall;
  colliders: RAPIER.Collider[];
}

/** Monta a loja de ferramentas recebida no `welcome` (Gabriel, bancada, painel, tora e colisores). */
export class ToolShopManager {
  private built: Built | null = null;

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui a loja atual (no reconectar, o servidor pode ter reiniciado). */
  load(data: ToolShopData): void {
    this.clear();
    const seller = new Character(data.sellerName, data.appearance);
    seller.root.position.set(data.position.x, 0, data.position.z);
    seller.root.rotation.y = data.rotationY;

    const stall = new ToolStall(data.signText);
    stall.root.position.set(data.counter.x, 0, data.counter.z);
    stall.root.rotation.y = data.rotationY;

    const board = localToWorldXZ(data.counter, data.rotationY, 0, ToolStall.BOARD_BOX.z);
    const log = localToWorldXZ(data.counter, data.rotationY, ToolStall.LOG.x, ToolStall.LOG.z);
    const colliders = [
      this.physics.createStaticBox(data.counter.x, data.counter.z, { ...ToolStall.HALF_EXTENTS }, data.rotationY),
      this.physics.createStaticBox(board.x, board.z, { ...ToolStall.BOARD_BOX.half }, data.rotationY),
      this.physics.createStaticCylinder(log.x, log.z, ToolStall.LOG.height, ToolStall.LOG.radius),
      this.physics.createStaticCylinder(data.position.x, data.position.z, PLAYER_HEIGHT, PLAYER_RADIUS),
    ];
    this.scene.add(seller.root, stall.root);
    this.built = { data, seller, stall, colliders };
  }

  get data(): ToolShopData | null {
    return this.built?.data ?? null;
  }

  /** Centro da bancada, ou null se a loja ainda não chegou. */
  counterPosition(): { x: number; z: number } | null {
    const c = this.built?.data.counter;
    return c ? { x: c.x, z: c.z } : null;
  }

  /** Alguém comprou: o Gabriel comemora. */
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
