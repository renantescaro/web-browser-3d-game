import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { localToWorldXZ } from "@jogo/shared/math";
import type { ShootingBoothData } from "@jogo/shared/protocol";
import { Character } from "../entities/Character";
import type { Duck } from "../entities/shooting/Duck";
import { ShootingStall } from "../entities/shooting/ShootingStall";
import type { Physics } from "./Physics";

/** Reações do Balotinho ao fim de uma partida (para todos verem). */
const RESULT_REACTIONS = { won: "🏆", lost: "😜" } as const;

interface Built {
  data: ShootingBoothData;
  owner: Character;
  stall: ShootingStall;
  collider: RAPIER.Collider;
  /** Raiz de cada pato → pato, para achar qual foi atingido pelo raio. */
  duckByRoot: Map<THREE.Object3D, Duck>;
}

export interface DuckDebugInfo {
  id: string;
  x: number;
  y: number;
  z: number;
  hittable: boolean;
}

/** Monta a barraca de Tiro ao Alvo recebida no `welcome` (Balotinho, barraca, patos e colisor). */
export class ShootingBoothManager {
  private built: Built | null = null;

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui a barraca atual (no reconectar, o servidor pode ter reiniciado). */
  load(data: ShootingBoothData): void {
    this.clear();
    const owner = new Character(data.ownerName, data.appearance);
    owner.root.position.set(data.ownerPosition.x, 0, data.ownerPosition.z);
    owner.root.rotation.y = data.rotationY;

    const stall = new ShootingStall(data.signText);
    stall.root.position.set(data.position.x, 0, data.position.z);
    stall.root.rotation.y = data.rotationY;

    const { offsetZ, half } = ShootingStall.COLLIDER;
    const center = localToWorldXZ(data.position, data.rotationY, 0, offsetZ);
    const collider = this.physics.createStaticBox(center.x, center.z, { ...half }, data.rotationY);

    this.scene.add(owner.root, stall.root);
    const duckByRoot = new Map(stall.ducks.map((d) => [d.root, d] as const));
    this.built = { data, owner, stall, collider, duckByRoot };
  }

  get data(): ShootingBoothData | null {
    return this.built?.data ?? null;
  }

  /** Centro do balcão, ou null se a barraca ainda não chegou. */
  counterPosition(): { x: number; z: number } | null {
    const p = this.built?.data.position;
    return p ? { x: p.x, z: p.z } : null;
  }

  /** Ponto no meio dos trilhos dos patos, no mundo (para onde a mira começa). */
  aimCenter(): THREE.Vector3 | null {
    if (!this.built) return null;
    const { x, y, z } = ShootingStall.AIM_CENTER;
    return this.built.stall.root.localToWorld(new THREE.Vector3(x, y, z));
  }

  /**
   * Resolve um tiro ao longo do raio. A primeira coisa atingida decide: um pato em pé
   * tomba e o tiro conta; a barraca, o Balotinho ou nada é erro. Patos deitados não
   * bloqueiam. Retorna o id do pato acertado ou null.
   */
  shoot(raycaster: THREE.Raycaster): string | null {
    if (!this.built) return null;
    const { stall, owner } = this.built;
    stall.root.updateMatrixWorld(true);
    owner.root.updateMatrixWorld(true);
    for (const hit of raycaster.intersectObjects([stall.root, owner.root], true)) {
      const duck = this.duckOf(hit.object);
      if (duck && !duck.hittable) continue;
      if (!duck) return null;
      duck.knockDown();
      return duck.id;
    }
    return null;
  }

  private duckOf(object: THREE.Object3D): Duck | null {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      const duck = this.built?.duckByRoot.get(o);
      if (duck) return duck;
    }
    return null;
  }

  /** Fim de uma partida de alguém: o Balotinho comemora ou provoca. */
  playResult(won: boolean): void {
    this.built?.owner.playReaction(won ? RESULT_REACTIONS.won : RESULT_REACTIONS.lost);
  }

  update(dt: number): void {
    if (!this.built) return;
    this.built.stall.update(dt);
    this.built.owner.update(dt, "idle", 0);
  }

  ducksDebugInfo(): DuckDebugInfo[] {
    const v = new THREE.Vector3();
    return (this.built?.stall.ducks ?? []).map((d) => {
      d.worldCenter(v);
      return { id: d.id, x: v.x, y: v.y, z: v.z, hittable: d.hittable };
    });
  }

  clear(): void {
    if (!this.built) return;
    this.built.owner.dispose();
    this.built.stall.dispose();
    this.physics.removeCollider(this.built.collider);
    this.built = null;
  }
}
