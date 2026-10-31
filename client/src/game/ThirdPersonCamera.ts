// Câmera orbital atrás e acima do personagem, girada pelo mouse. No modo de mira ela
// chega mais perto e vai para trás do ombro direito, com a mira no centro da tela.
import * as THREE from "three";
import {
  AIM_CAMERA_BLEND,
  AIM_CAMERA_DISTANCE,
  AIM_CAMERA_SHOULDER,
  CAMERA_DEFAULT_PITCH,
  CAMERA_DISTANCE,
  CAMERA_FOLLOW,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_PITCH,
  CAMERA_PIVOT_HEIGHT,
  CAMERA_SENSITIVITY,
} from "@jogo/shared/constants";
import { clamp, forwardFromYaw } from "@jogo/shared/math";

const MIN_CAMERA_Y = 0.3;
/** Iterações do `aimAt` (o ponto mirado depende do ângulo por causa do ombro). */
const AIM_ITERATIONS = 6;

export class ThirdPersonCamera {
  /** Direção horizontal para onde a câmera olha (mesma convenção do personagem). */
  yaw = 0;
  pitch = CAMERA_DEFAULT_PITCH;
  /** Modo de mira (por cima do ombro), ligado pelo Tiro ao Alvo. */
  aiming = false;
  private readonly pivot = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private initialized = false;
  /** 0 = câmera normal; 1 = mirando. Transição suave entre os dois. */
  private aimBlend = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * CAMERA_SENSITIVITY;
    this.pitch = clamp(this.pitch + dy * CAMERA_SENSITIVITY, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
  }

  /** Converte o input (relativo à câmera) numa direção no mundo, com comprimento ≤ 1. */
  toWorldDirection(moveX: number, moveZ: number, out: THREE.Vector3): THREE.Vector3 {
    const f = forwardFromYaw(this.yaw);
    // Direita da câmera = frente × cima.
    const rx = -f.z;
    const rz = f.x;
    out.set(f.x * moveZ + rx * moveX, 0, f.z * moveZ + rz * moveX);
    if (out.lengthSq() > 1) out.normalize();
    return out;
  }

  update(dt: number, target: THREE.Vector3): void {
    this.desired.set(target.x, target.y + CAMERA_PIVOT_HEIGHT, target.z);
    if (!this.initialized) {
      this.pivot.copy(this.desired);
      this.initialized = true;
    } else {
      this.pivot.lerp(this.desired, 1 - Math.exp(-CAMERA_FOLLOW * dt));
    }
    const goal = this.aiming ? 1 : 0;
    this.aimBlend += (goal - this.aimBlend) * (1 - Math.exp(-AIM_CAMERA_BLEND * dt));
    if (Math.abs(goal - this.aimBlend) < 0.001) this.aimBlend = goal;

    const distance = THREE.MathUtils.lerp(CAMERA_DISTANCE, AIM_CAMERA_DISTANCE, this.aimBlend);
    this.lookTarget(this.yaw, this.target);
    const f = forwardFromYaw(this.yaw);
    const horizontal = distance * Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x - f.x * horizontal,
      Math.max(this.target.y + distance * Math.sin(this.pitch), MIN_CAMERA_Y),
      this.target.z - f.z * horizontal,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Ponto que a câmera mira: o pivô, deslocado para o ombro direito conforme o modo de mira. */
  private lookTarget(yaw: number, out: THREE.Vector3): THREE.Vector3 {
    const f = forwardFromYaw(yaw);
    // Direita da câmera = frente × cima (igual ao `toWorldDirection`).
    const shoulder = AIM_CAMERA_SHOULDER * this.aimBlend;
    return out.set(this.pivot.x - f.z * shoulder, this.pivot.y, this.pivot.z + f.x * shoulder);
  }

  /**
   * Gira a câmera para o centro da tela apontar para `point`. O centro da tela é a reta
   * que passa pelo ponto mirado (`lookTarget`) na direção de yaw/pitch; como esse ponto
   * muda com o yaw (ombro), o ângulo é refinado algumas vezes.
   */
  aimAt(point: THREE.Vector3): void {
    const from = new THREE.Vector3();
    for (let i = 0; i < AIM_ITERATIONS; i++) {
      this.lookTarget(this.yaw, from);
      const dx = point.x - from.x;
      const dy = point.y - from.y;
      const dz = point.z - from.z;
      this.yaw = Math.atan2(dx, dz);
      this.pitch = clamp(Math.atan2(-dy, Math.hypot(dx, dz)), CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
    }
  }
}
