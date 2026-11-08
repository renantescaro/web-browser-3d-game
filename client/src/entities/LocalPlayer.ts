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
import { KartMotion } from "./KartMotion";

/** Animações de quem está parado fazendo algo (com a vara ou a espingarda na mão). */
export type Stance = Extract<AnimState, "fish" | "aim" | "chop">;

/** Por quanto tempo um pulo apertado um pouco antes de tocar o chão continua valendo (s). */
const JUMP_BUFFER = 0.12;
/** Abaixo disso, considera que caiu do mundo e volta ao centro. */
const FALL_LIMIT = -20;
/** No kart, contato com normal mais vertical que isto é chão (não freia o kart). */
const WALL_NORMAL_MAX_Y = 0.7;

export class LocalPlayer {
  readonly character: Character;
  /** Posição renderizada (pés), interpolada entre passos de física. */
  readonly renderPosition = new THREE.Vector3();
  rotationY: number;

  private readonly body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
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
  /** Parado numa atividade (pescando, mirando ou cortando árvore): a animação vira essa. */
  stance: Stance | null = null;
  /** No kart: o input vira acelerar/frear e virar (ver `setKartControls`). */
  private kart: KartMotion | null = null;
  private kartThrottle = 0;
  private kartSteer = 0;
  /** Esperando a largada: o kart não sai do lugar. */
  private kartFrozen = true;
  /** Colisores em que o kart encostou no último passo (para as batidas). */
  private readonly touched = new Set<number>();

  constructor(
    private readonly physics: Physics,
    scene: THREE.Scene,
    name: string,
    color: string,
    private readonly spawn: Vec3,
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

  /** Está dirigindo um kart? */
  get driving(): boolean {
    return this.kart !== null;
  }

  /** Velocidade do kart em km/h (0 a pé). */
  get kartKmh(): number {
    return this.kart?.kmh ?? 0;
  }

  /** Velocidade do kart para a frente (m/s, 0 a pé). */
  get kartSpeed(): number {
    return this.kart?.speed ?? 0;
  }

  /** Entra num kart em (x, z), virado para `rotationY`, parado. */
  enterKart(x: number, z: number, rotationY: number): void {
    if (!this.kart) this.collider = this.physics.replaceCharacterShape(this.body, this.collider, "kart");
    this.kart = new KartMotion();
    this.kartFrozen = true;
    this.stance = null;
    this.rotationY = rotationY;
    this.placeAt(x, z, 0.3);
  }

  /** Desce do kart em (x, z). */
  exitKart(x: number, z: number): void {
    if (!this.kart) return;
    this.kart = null;
    this.collider = this.physics.replaceCharacterShape(this.body, this.collider, "person");
    this.placeAt(x, z);
  }

  /** Pedais e volante do frame: `throttle` 1 acelera, −1 freia/ré; `steer` −1 esquerda, 1 direita. */
  setKartControls(throttle: number, steer: number, frozen: boolean): void {
    this.kartThrottle = throttle;
    this.kartSteer = steer;
    this.kartFrozen = frozen;
  }

  /** Colisores em que o kart encostou desde a última chamada (e esquece). */
  takeTouched(): number[] {
    const handles = [...this.touched];
    this.touched.clear();
    return handles;
  }

  /** Calcula o movimento do passo e agenda a nova posição. Chamar antes de `world.step()`. */
  preStep(dt: number): void {
    if (this.kart) {
      this.kartStep(this.kart, dt);
      return;
    }
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

  /** Passo do kart: pedais, volante, empurrões e gravidade; bater em algo tira velocidade. */
  private kartStep(kart: KartMotion, dt: number): void {
    this.knockback.multiplyScalar(Math.exp(-KNOCKBACK_DAMPING * dt));
    this.jumpBuffer = 0;
    this.punchTimer = 0;
    if (this.kartFrozen) kart.speed = 0;
    else this.rotationY = wrapAngle(this.rotationY + kart.step(dt, this.kartThrottle, this.kartSteer));
    this.verticalSpeed += GRAVITY * dt;

    const fx = Math.sin(this.rotationY);
    const fz = Math.cos(this.rotationY);
    const desired = {
      x: (fx * kart.speed + this.knockback.x) * dt,
      y: this.verticalSpeed * dt,
      z: (fz * kart.speed + this.knockback.z) * dt,
    };
    this.controller.computeColliderMovement(this.collider, desired);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.verticalSpeed < 0) this.verticalSpeed = 0;
    this.velocity.set(moved.x / dt, moved.y / dt, moved.z / dt);
    // Só encostar de lado (mureta, outro jogador) conta como batida. O chão não: às vezes o
    // controlador do Rapier devolve um passo sem movimento só por estar apoiado nele.
    let blocked = false;
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const hit = this.controller.computedCollision(i);
      if (!hit?.collider || Math.abs(hit.normal1.y) > WALL_NORMAL_MAX_Y) continue;
      blocked = true;
      this.touched.add(hit.collider.handle);
    }
    if (blocked) {
      // Só a parte do movimento que veio do motor conta (o empurrão não acelera o kart).
      const forward = (moved.x * fx + moved.z * fz) / dt - (this.knockback.x * fx + this.knockback.z * fz);
      kart.limitTo(forward + 0.01 * Math.sign(kart.speed));
    }

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z });
  }

  /** Lê a posição resultante. Chamar depois de `world.step()`. */
  postStep(): void {
    this.prev.copy(this.curr);
    const t = this.body.translation();
    this.curr.set(t.x, t.y - CAPSULE_CENTER_Y, t.z);
    if (this.curr.y < FALL_LIMIT) this.respawn();
  }

  /** Caiu do mapa: volta ao ponto onde nasceu (na praça). */
  private respawn(): void {
    this.placeAt(this.spawn.x, this.spawn.z);
  }

  /** Põe o personagem em (x, z), `height` metros acima do chão, parado. */
  placeAt(x: number, z: number, height = 2): void {
    this.body.setTranslation({ x, y: CAPSULE_CENTER_Y + height, z }, true);
    this.curr.set(x, height, z);
    this.prev.copy(this.curr);
    this.verticalSpeed = 0;
    this.knockback.set(0, 0, 0);
  }

  get anim(): AnimState {
    if (this.kart) return "kart";
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
