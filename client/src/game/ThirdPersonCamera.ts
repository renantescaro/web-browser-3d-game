// Câmera orbital atrás e acima do personagem, girada pelo mouse.
import * as THREE from "three";
import {
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

export class ThirdPersonCamera {
  /** Direção horizontal para onde a câmera olha (mesma convenção do personagem). */
  yaw = 0;
  pitch = CAMERA_DEFAULT_PITCH;
  private readonly pivot = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private initialized = false;

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

    const f = forwardFromYaw(this.yaw);
    const horizontal = CAMERA_DISTANCE * Math.cos(this.pitch);
    this.camera.position.set(
      this.pivot.x - f.x * horizontal,
      Math.max(this.pivot.y + CAMERA_DISTANCE * Math.sin(this.pitch), MIN_CAMERA_Y),
      this.pivot.z - f.z * horizontal,
    );
    this.camera.lookAt(this.pivot);
  }
}
