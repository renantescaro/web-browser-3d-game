// Jogador controlado localmente: física com o KinematicCharacterController do Rapier.
import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import {
  GRAVITY,
  JUMP_VELOCITY,
  KNOCKBACK_DAMPING,
  PUNCH_ANIM_MS,
  PUNCH_COOLDOWN_MS,
  RUN_SPEED,
  TURN_SPEED,
  WALK_SPEED,
} from "@jogo/shared/constants";
import { wrapAngle } from "@jogo/shared/math";
import type { AnimState, StateMessage, Vec3 } from "@jogo/shared/protocol";
import { CAPSULE_CENTER_Y, type Physics } from "../game/Physics";
import { Character } from "./Character";

/** Animações de quem está parado fazendo algo (com a vara ou a espingarda na mão). */
export type Stance = Extract<AnimState, "fish" | "aim">;

/** Por quanto tempo um pulo apertado um pouco antes de tocar o chão continua valendo (s). */
const JUMP_BUFFER = 0.12;
/** Abaixo disso, considera que caiu do mundo e volta ao centro. */
const FALL_LIMIT = -20;

export class LocalPlayer {
  readonly character: Character;
  /** Posição renderizada (pés), interpolada entre passos de física. */
  readonly renderPosition = new THREE.Vector3();
  rotationY: number;

  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly prev = new THREE.Vector3();
  private readonly curr = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly moveDir = new THREE.Vector3();
  private readonly knockback = new THREE.Vector3();
  private running = false;
  private verticalSpeed = 0;
  private grounded = false;
  private jumpBuffer = 0;
  private punchTimer = 0;
  private lastPunchAt = -Infinity;
  /** Parado numa atividade (pescando ou mirando): a animação vira essa. */
  stance: Stance | null = null;

  constructor(
    private readonly physics: Physics,
    scene: THREE.Scene,
    name: string,
    color: string,
    spawn: Vec3,
    rotationY: number,
  ) {
    this.character = new Character(name, color);
    scene.add(this.character.root);
    ({ body: this.body, collider: this.collider } = physics.createCharacterBody(spawn));
    this.controller = physics.createCharacterController();
    this.rotationY = rotationY;
    this.curr.set(spawn.x, spawn.y, spawn.z);
    this.prev.copy(this.curr);
    this.renderPosition.copy(this.curr);
  }

  /** Recebe as intenções do frame (direção no mundo, já relativa à câmera). */
  setInput(direction: THREE.Vector3, run: boolean, jump: boolean): void {
    this.moveDir.copy(direction);
    this.running = run;
    if (jump) this.jumpBuffer = JUMP_BUFFER;
  }

  /** Tenta socar. Retorna true se o soco começou (respeitando o cooldown). */
  tryPunch(now: number): boolean {
    if (now - this.lastPunchAt < PUNCH_COOLDOWN_MS) return false;
    this.lastPunchAt = now;
    this.punchTimer = PUNCH_ANIM_MS / 1000;
    this.character.playPunch();
    return true;
  }

  /** Vira o personagem para um ponto (ex.: a fonte, ao começar a pescar). */
  faceTowards(x: number, z: number): void {
    this.rotationY = Math.atan2(x - this.curr.x, z - this.curr.z);
  }

  /** Empurrão vindo do servidor (evento `hit`). */
  applyKnockback(kb: Vec3): void {
    this.knockback.set(kb.x, 0, kb.z);
    this.verticalSpeed = Math.max(this.verticalSpeed, kb.y);
    this.grounded = false;
    this.character.playHit();
  }

  /** Calcula o movimento do passo e agenda a nova posição. Chamar antes de `world.step()`. */
  preStep(dt: number): void {
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.knockback.multiplyScalar(Math.exp(-KNOCKBACK_DAMPING * dt));

    if (this.jumpBuffer > 0 && this.grounded) {
      this.verticalSpeed = JUMP_VELOCITY;
      this.jumpBuffer = 0;
      this.grounded = false;
    }
    this.verticalSpeed += GRAVITY * dt;

    const speed = this.running ? RUN_SPEED : WALK_SPEED;
    const desired = {
      x: (this.moveDir.x * speed + this.knockback.x) * dt,
      y: this.verticalSpeed * dt,
      z: (this.moveDir.z * speed + this.knockback.z) * dt,
    };
    this.controller.computeColliderMovement(this.collider, desired);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.verticalSpeed < 0) this.verticalSpeed = 0;
    this.velocity.set(moved.x / dt, moved.y / dt, moved.z / dt);

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z });

    // Gira para a direção em que está andando (não para a câmera).
    if (this.moveDir.lengthSq() > 0.0001) {
      const target = Math.atan2(this.moveDir.x, this.moveDir.z);
      this.rotationY = wrapAngle(this.rotationY + wrapAngle(target - this.rotationY) * Math.min(1, TURN_SPEED * dt));
    }
  }

  /** Lê a posição resultante. Chamar depois de `world.step()`. */
  postStep(): void {
    this.prev.copy(this.curr);
    const t = this.body.translation();
    this.curr.set(t.x, t.y - CAPSULE_CENTER_Y, t.z);
    if (this.curr.y < FALL_LIMIT) this.respawn();
  }

  private respawn(): void {
    this.body.setTranslation({ x: 0, y: CAPSULE_CENTER_Y + 2, z: 0 }, true);
    this.curr.set(0, 2, 0);
    this.prev.copy(this.curr);
    this.verticalSpeed = 0;
    this.knockback.set(0, 0, 0);
  }

  get anim(): AnimState {
    if (this.punchTimer > 0) return "punch";
    if (!this.grounded) return "jump";
    if (this.stance) return this.stance;
    if (this.moveDir.lengthSq() < 0.0001) return "idle";
    return this.running ? "run" : "walk";
  }

  /** Atualiza a malha (interpolando entre os passos de física) e a animação. */
  render(alpha: number, dt: number): void {
    this.renderPosition.lerpVectors(this.prev, this.curr, alpha);
    this.character.root.position.copy(this.renderPosition);
    this.character.root.rotation.y = this.rotationY;
    const anim = this.anim;
    this.character.update(dt, anim, Math.hypot(this.velocity.x, this.velocity.z));
  }

  state(): StateMessage {
    const c = this.curr;
    const v = this.velocity;
    return {
      position: { x: c.x, y: c.y, z: c.z },
      rotationY: this.rotationY,
      velocity: { x: v.x, y: v.y, z: v.z },
      anim: this.anim,
    };
  }

  dispose(): void {
    this.physics.removeController(this.controller);
    this.physics.removeBody(this.body);
    this.character.dispose();
  }
}
