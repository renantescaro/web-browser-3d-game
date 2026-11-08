import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import { KART_WALL_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS } from "@jogo/shared/constants";
import { buildKartPath, insideSide, type KartPath } from "@jogo/shared/kart";
import { localToWorldXZ } from "@jogo/shared/math";
import type { KartTrackData } from "@jogo/shared/protocol";
import { Character } from "../entities/Character";
import { KartModel } from "../entities/kart/KartModel";
import { KartStall } from "../entities/kart/KartStall";
import { KartTrackModel } from "../entities/kart/KartTrackModel";
import type { Physics } from "./Physics";

/** Cor do kart de mostruário, ao lado da barraca. */
const DISPLAY_KART_COLOR = 0xf6d743;

interface Built {
  data: KartTrackData;
  path: KartPath;
  inside: 1 | -1;
  owner: Character;
  track: KartTrackModel;
  stall: KartStall;
  displayKart: KartModel;
  colliders: RAPIER.Collider[];
}

/** Monta o kartódromo recebido no `welcome`: pista, muretas, pórtico, barraca, Vitinho e colisores. */
export class KartTrackManager {
  private built: Built | null = null;

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui o kartódromo atual (no reconectar, o servidor pode ter reiniciado). */
  load(data: KartTrackData): void {
    this.clear();
    const path = buildKartPath(data.center, data.trackRotation);
    const inside = insideSide(path, data.center);
    const track = new KartTrackModel(path, inside);

    const owner = new Character(data.ownerName, data.appearance);
    owner.root.position.set(data.position.x, 0, data.position.z);
    owner.root.rotation.y = data.rotationY;

    const stall = new KartStall(data.signText);
    stall.root.position.set(data.counter.x, 0, data.counter.z);
    stall.root.rotation.y = data.rotationY;

    const d = KartStall.DISPLAY_KART;
    const displayKart = new KartModel(DISPLAY_KART_COLOR);
    const kartSpot = localToWorldXZ(data.counter, data.rotationY, d.x, d.z);
    displayKart.root.position.set(kartSpot.x, 0, kartSpot.z);
    displayKart.root.rotation.y = data.rotationY + d.rotationY;

    const t = KartStall.TIRE_STACK;
    const tires = localToWorldXZ(data.counter, data.rotationY, t.x, t.z);
    const colliders = [
      ...KartTrackModel.wallSegments(path).map((s) =>
        this.physics.createStaticBox(s.x, s.z, { x: s.halfLength, y: KART_WALL_HEIGHT / 2, z: 0.3 }, s.rotationY),
      ),
      ...KartTrackModel.gantryPosts(path).map((p) => this.physics.createStaticCylinder(p.x, p.z, p.height, 0.15)),
      this.physics.createStaticBox(data.counter.x, data.counter.z, { ...KartStall.HALF_EXTENTS }, data.rotationY),
      this.physics.createStaticCylinder(tires.x, tires.z, t.height, t.radius),
      this.physics.createStaticBox(kartSpot.x, kartSpot.z, { x: 0.5, y: 0.4, z: 0.85 }, data.rotationY + d.rotationY),
      this.physics.createStaticCylinder(data.position.x, data.position.z, PLAYER_HEIGHT, PLAYER_RADIUS),
    ];
    this.scene.add(track.root, owner.root, stall.root, displayKart.root);
    this.built = { data, path, inside, owner, track, stall, displayKart, colliders };
  }

  get data(): KartTrackData | null {
    return this.built?.data ?? null;
  }

  /** O traçado e o lado de dentro (para o grid), ou null se o kartódromo ainda não chegou. */
  get layout(): { path: KartPath; inside: 1 | -1 } | null {
    return this.built && { path: this.built.path, inside: this.built.inside };
  }

  /** Centro do balcão, ou null se o kartódromo ainda não chegou. */
  counterPosition(): { x: number; z: number } | null {
    const c = this.built?.data.counter;
    return c ? { x: c.x, z: c.z } : null;
  }

  /** O Vitinho reage (largada, chegada…), para todos verem. */
  playReaction(emoji: string): void {
    this.built?.owner.playReaction(emoji);
  }

  update(dt: number): void {
    this.built?.owner.update(dt, "idle", 0);
  }

  clear(): void {
    if (!this.built) return;
    const b = this.built;
    b.owner.dispose();
    b.track.dispose();
    b.stall.dispose();
    b.displayKart.dispose();
    for (const c of b.colliders) this.physics.removeCollider(c);
    this.built = null;
  }
}
