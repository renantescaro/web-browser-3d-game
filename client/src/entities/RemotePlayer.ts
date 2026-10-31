// Jogador remoto: interpola entre snapshots (sem "teleportar") e tem collider cinemático.
import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { INTERPOLATION_DELAY_MS } from "@jogo/shared/constants";
import { wrapAngle } from "@jogo/shared/math";
import type { Outfit } from "@jogo/shared/outfits";
import type { AnimState, PlayerSnapshot } from "@jogo/shared/protocol";
import { CAPSULE_CENTER_Y, type Physics } from "../game/Physics";
import { Character } from "./Character";

interface BufferedState {
  /** Horário local (performance.now) em que este estado "aconteceu". */
  t: number;
  position: THREE.Vector3;
  rotationY: number;
  speed: number;
  anim: AnimState;
}

const MAX_BUFFER = 30;

export class RemotePlayer {
  readonly id: string;
  readonly name: string;
  readonly character: Character;
  readonly position = new THREE.Vector3();
  private readonly body: RAPIER.RigidBody;
  private readonly buffer: BufferedState[] = [];
  private rotationY: number;
  private anim: AnimState = "idle";
  private speed = 0;
  private outfit: Outfit = {};

  constructor(
    private readonly physics: Physics,
    scene: THREE.Scene,
    snapshot: PlayerSnapshot,
    now: number,
  ) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.character = new Character(snapshot.name, snapshot.color);
    scene.add(this.character.root);
    this.body = physics.createCharacterBody(snapshot.position).body;
    this.rotationY = snapshot.rotationY;
    this.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
    this.push(snapshot, now);
  }

  /** Guarda um novo estado recebido, com horário já convertido para o relógio local. */
  push(snapshot: PlayerSnapshot, t: number): void {
    this.outfit = snapshot.outfit;
    this.character.setOutfit(snapshot.outfit);
    const last = this.buffer[this.buffer.length - 1];
    if (last && t <= last.t) return;
    const p = snapshot.position;
    this.buffer.push({
      t,
      position: new THREE.Vector3(p.x, p.y, p.z),
      rotationY: snapshot.rotationY,
      speed: Math.hypot(snapshot.velocity.x, snapshot.velocity.z),
      anim: snapshot.anim,
    });
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
  }

  /** O que o jogador veste agora (para os testes E2E). */
  get currentOutfit(): Outfit {
    return this.outfit;
  }

  /** Recebeu um soco: só a reação visual (o empurrão vem pelo estado do próprio jogador). */
  playHit(): void {
    this.character.playHit();
  }

  /** Posiciona o personagem ~100 ms no passado, interpolando entre os dois estados vizinhos. */
  update(now: number, dt: number): void {
    const renderTime = now - INTERPOLATION_DELAY_MS;
    // Descarta estados antigos, mantendo um anterior ao renderTime.
    while (this.buffer.length >= 2 && (this.buffer[1]?.t ?? Infinity) <= renderTime) this.buffer.shift();

    const a = this.buffer[0];
    const b = this.buffer[1];
    if (a && b && renderTime >= a.t) {
      const alpha = Math.min(1, (renderTime - a.t) / (b.t - a.t));
      this.position.lerpVectors(a.position, b.position, alpha);
      this.rotationY = a.rotationY + wrapAngle(b.rotationY - a.rotationY) * alpha;
      this.speed = a.speed + (b.speed - a.speed) * alpha;
      this.setAnim(alpha < 0.5 ? a.anim : b.anim);
    } else if (a) {
      // Sem estado suficiente: fica parado no mais recente.
      this.position.copy(a.position);
      this.rotationY = a.rotationY;
      this.speed = a.speed;
      this.setAnim(a.anim);
    }

    this.body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y + CAPSULE_CENTER_Y,
      z: this.position.z,
    });
    this.character.root.position.copy(this.position);
    this.character.root.rotation.y = this.rotationY;
    this.character.update(dt, this.anim, this.speed);
  }

  private setAnim(anim: AnimState): void {
    if (anim === "punch" && this.anim !== "punch") this.character.playPunch();
    this.anim = anim;
  }

  dispose(): void {
    this.physics.removeBody(this.body);
    this.character.dispose();
  }
}
