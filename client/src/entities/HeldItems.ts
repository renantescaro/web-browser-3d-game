// Objetos que o personagem segura na mão direita, cada um numa atividade: vara (pescando),
// espingarda (mirando) e machado (cortando árvore). Mostra só o da animação atual e aplica o
// coice do tiro e o golpe do machado nos braços.
import * as THREE from "three";
import type { AnimState } from "@jogo/shared/protocol";
import { AirRifle } from "./AirRifle";
import { FishingRod } from "./FishingRod";
import { TOOL_MODELS } from "./tools/toolModels";
import { WornItem } from "./wearables/WornItem";

/** Coice da espingarda: duração (ms) e quanto os braços sobem (rad). */
const SHOT_KICK_MS = 160;
const SHOT_KICK = 0.3;
/** Golpe de machado: duração (ms) e quanto os braços descem a partir da pose erguida (rad). */
const CHOP_SWING_MS = 320;
const CHOP_SWING = 1.5;

/** Onde prender e como inclinar os objetos (depende das medidas e poses do `Character`). */
export interface HeldItemsLayout {
  /** Y da mão no espaço do braço (o braço pende em -Y a partir do ombro). */
  handY: number;
  /** Inclinação da vara em relação ao braço (rad, em torno de X). */
  rodTilt: number;
  /** Quanto o braço direito vira para dentro mirando; a espingarda compensa para apontar reto. */
  aimSpread: number;
  /** Ângulo dos braços (rad, em torno de X) na pose de cortar, com o machado erguido. */
  chopArms: { left: number; right: number };
}

export class HeldItems {
  private readonly rod = new FishingRod();
  private readonly rifle = new AirRifle();
  private readonly axe = new WornItem();
  private readonly axeHolder = new THREE.Group();
  private shotElapsed = Infinity;
  private chopElapsed = Infinity;

  constructor(
    private readonly rightArm: THREE.Object3D,
    private readonly leftArm: THREE.Object3D,
    private readonly layout: HeldItemsLayout,
  ) {
    this.rod.root.position.y = layout.handY;
    this.rod.root.rotation.x = layout.rodTilt;
    this.rifle.root.position.y = layout.handY;
    this.rifle.root.rotation.z = layout.aimSpread;
    // Machado: o cabo segue o braço e a lâmina fica para a frente do golpe.
    this.axeHolder.position.y = layout.handY + 0.12;
    this.axeHolder.rotation.set(Math.PI, -Math.PI / 2, 0);
    this.axeHolder.visible = false;
    TOOL_MODELS.axe(this.axe, this.axeHolder);
    rightArm.add(this.rod.root, this.rifle.root, this.axeHolder);
  }

  /** Materiais que piscam junto com o corpo quando o personagem leva um soco. */
  get materials(): readonly THREE.MeshStandardMaterial[] {
    return this.axe.materials;
  }

  playShot(): void {
    this.shotElapsed = 0;
  }

  playChop(): void {
    this.chopElapsed = 0;
  }

  /**
   * Chamar depois de posar os braços. `bodyTiltX` é a inclinação do corpo (a linha da vara
   * compensa para pender na vertical).
   */
  update(dt: number, anim: AnimState, bodyTiltX: number): void {
    const fishing = anim === "fish";
    this.rod.root.visible = fishing;
    if (fishing) {
      this.rod.setLineAngle(-(this.rod.root.rotation.x + this.rightArm.rotation.x + bodyTiltX));
      this.rod.update(dt);
    }

    this.rifle.root.visible = anim === "aim";
    if (anim === "aim" && this.shotElapsed < SHOT_KICK_MS) {
      this.shotElapsed += dt * 1000;
      this.moveArms(-Math.sin(Math.PI * Math.min(1, this.shotElapsed / SHOT_KICK_MS)) * SHOT_KICK);
    }

    this.axeHolder.visible = anim === "chop";
    if (anim === "chop" && this.chopElapsed < CHOP_SWING_MS) {
      // Ângulo absoluto (como o soco): somar a cada quadro acumularia com a suavização da pose.
      this.chopElapsed += dt * 1000;
      const swing = Math.sin(Math.PI * Math.min(1, this.chopElapsed / CHOP_SWING_MS)) * CHOP_SWING;
      this.rightArm.rotation.x = this.layout.chopArms.right + swing;
      this.leftArm.rotation.x = this.layout.chopArms.left + swing;
    }
  }

  /** Gira os dois braços juntos (positivo = para baixo/trás, negativo = para cima/frente). */
  private moveArms(angle: number): void {
    this.rightArm.rotation.x += angle;
    this.leftArm.rotation.x += angle;
  }

  dispose(): void {
    this.rod.dispose();
    this.rifle.dispose();
    this.axe.dispose();
  }
}
