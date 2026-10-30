import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import { FOUNTAIN_PILLAR_RADIUS, FOUNTAIN_RADIUS, FOUNTAIN_WALL_HEIGHT } from "@jogo/shared/constants";
import type { SquareData } from "@jogo/shared/protocol";
import type { Model } from "../entities/Model";
import { Bench } from "../entities/square/Bench";
import { Fountain } from "../entities/square/Fountain";
import { Plaza } from "../entities/square/Plaza";
import { Sign } from "../entities/square/Sign";
import type { Physics } from "./Physics";

export interface SquareDebugInfo {
  x: number;
  z: number;
  benches: number;
  signText: string;
  fountain: { x: number; z: number; innerRadius: number; outerRadius: number };
  /** Posição relativa ao centro da fonte. */
  fish: { id: string; scale: number; x: number; z: number }[];
}

interface Built {
  data: SquareData;
  models: Model[];
  fountain: Fountain;
  sign: Sign;
  colliders: RAPIER.Collider[];
}

/** Monta a praça recebida no `welcome` (piso, fonte com peixes, bancos e placa) e seus colisores. */
export class SquareManager {
  private built: Built | null = null;

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui a praça atual (no reconectar, o servidor pode ter reiniciado). */
  load(data: SquareData): void {
    this.clear();
    const { x, z } = data.position;
    const plaza = new Plaza();
    plaza.root.position.set(x, 0, z);

    const fountain = new Fountain(data.fountain);
    const fx = data.fountain.position.x;
    const fz = data.fountain.position.z;
    const colliders = [
      this.physics.createStaticCylinder(fx, fz, FOUNTAIN_WALL_HEIGHT, FOUNTAIN_RADIUS),
      this.physics.createStaticCylinder(fx, fz, Fountain.PILLAR_TOTAL_HEIGHT, FOUNTAIN_PILLAR_RADIUS),
    ];

    const benches = data.benches.map((b) => {
      const bench = new Bench();
      bench.root.position.set(b.position.x, 0, b.position.z);
      bench.root.rotation.y = b.rotationY;
      colliders.push(this.physics.createStaticBox(b.position.x, b.position.z, { ...Bench.HALF_EXTENTS }, b.rotationY));
      return bench;
    });

    const sign = new Sign(data.sign.text);
    sign.root.position.set(data.sign.position.x, 0, data.sign.position.z);
    sign.root.rotation.y = data.sign.rotationY;
    colliders.push(
      this.physics.createStaticBox(data.sign.position.x, data.sign.position.z, { ...Sign.HALF_EXTENTS }, data.sign.rotationY),
    );

    const models: Model[] = [plaza, fountain, ...benches, sign];
    for (const m of models) this.scene.add(m.root);
    this.built = { data, models, fountain, sign, colliders };
  }

  /** Centro da fonte, ou null se a praça ainda não chegou. */
  fountainPosition(): { x: number; z: number } | null {
    const p = this.built?.data.fountain.position;
    return p ? { x: p.x, z: p.z } : null;
  }

  update(dt: number): void {
    this.built?.fountain.update(dt);
  }

  debugInfo(): SquareDebugInfo | null {
    if (!this.built) return null;
    const { data, fountain, sign } = this.built;
    return {
      x: data.position.x,
      z: data.position.z,
      benches: data.benches.length,
      signText: sign.text,
      fountain: {
        x: data.fountain.position.x,
        z: data.fountain.position.z,
        innerRadius: fountain.innerRadius,
        outerRadius: fountain.outerRadius,
      },
      fish: fountain.fish.map((f) => ({ id: f.id, scale: f.scale, ...f.localPosition })),
    };
  }

  clear(): void {
    if (!this.built) return;
    for (const m of this.built.models) m.dispose();
    for (const c of this.built.colliders) this.physics.removeCollider(c);
    this.built = null;
  }
}
