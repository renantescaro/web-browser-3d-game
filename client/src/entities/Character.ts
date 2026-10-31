// Pessoa simples feita de primitivas + animações procedurais + rótulo de nome.
import * as THREE from "three";
import { PUNCH_ANIM_MS, RUN_SPEED, WALK_SPEED } from "@jogo/shared/constants";
import type { Outfit } from "@jogo/shared/outfits";
import type { AnimState, CharacterAppearance } from "@jogo/shared/protocol";
import { buildAccessories } from "./CharacterAccessories";
import { HeldItems } from "./HeldItems";
import { NameTag } from "./NameTag";
import { Wardrobe } from "./wearables/Wardrobe";

const SKIN_COLOR = 0xe0b48f;
const EYE_COLOR = 0x1d2733;
const HIT_FLASH_MS = 160;
const HIT_JOLT_MS = 260;
/** Quanto a fase do passo avança por metro andado (rad/m). */
const STRIDE = 2.4;

// Medidas (metros). A altura total fica em ~1,8.
const HIP_Y = 0.9;
const SHOULDER_Y = 1.44;
const LEG = { radius: 0.1, length: 0.7, x: 0.12 };
const ARM = { radius: 0.075, length: 0.48, x: 0.32 };
/** Pescando: inclinação do braço direito (para a frente) e da vara em relação à vertical. */
const FISH_ARM_X = -1.1;
const ROD_FROM_UP = 1.05;

/**
 * Variação da animação conforme a ação. `spreadL`/`spreadR` abrem os braços para fora
 * (negativo = para dentro, na frente do corpo).
 */
interface Pose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  spreadL: number;
  spreadR: number;
}

/** Mirando: braço direito esticado com a espingarda e o esquerdo cruzando para apoiar o cano. */
const AIM_POSE: Pose = { legL: 0.12, legR: -0.12, armL: -1.4, armR: -Math.PI / 2, spreadL: -0.75, spreadR: -0.35 };
/** Cortando: os dois braços erguidos acima da cabeça, segurando o machado. */
const CHOP_POSE: Pose = { legL: 0.2, legR: -0.2, armL: -2.6, armR: -2.7, spreadL: -0.3, spreadR: -0.25 };

export class Character {
  /** Posicionado nos pés; rotation.y = direção do personagem. */
  readonly root = new THREE.Group();
  /** Corpo interno, usado para o "tranco" e a torção do soco. */
  private readonly body = new THREE.Group();
  private readonly torso: THREE.Mesh;
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  /** Vara, espingarda e machado na mão direita (cada um só aparece na sua atividade). */
  private readonly held: HeldItems;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly nameTag: NameTag;
  private readonly wardrobe: Wardrobe;

  private time = Math.random() * 10;
  private walkPhase = 0;
  private swing = 0;
  private punchElapsed = Infinity;
  private hitElapsed = Infinity;

  /** `appearance` pode ser só a cor da camisa (jogadores) ou a aparência completa (NPCs). */
  constructor(name: string, appearance: CharacterAppearance | string) {
    const look = typeof appearance === "string" ? { shirtColor: appearance } : appearance;
    const color = look.shirtColor;
    const mainMat = this.material(color);
    const limbMat = this.material(new THREE.Color(color).multiplyScalar(0.72));
    const pantsMat = look.pantsColor ? this.material(look.pantsColor) : limbMat;
    const skinMat = this.material(look.skinColor ?? SKIN_COLOR);
    const eyeMat = this.material(EYE_COLOR);

    this.root.add(this.body);

    // Tronco
    this.torso = this.mesh(new THREE.CapsuleGeometry(0.23, 0.26, 6, 16), mainMat, this.body);
    this.torso.position.y = 1.2;

    // Cabeça + olhos (mostram para onde o personagem olha)
    const head = this.mesh(new THREE.SphereGeometry(0.16, 20, 16), skinMat, this.body);
    head.position.y = 1.64;
    const eyeGeo = new THREE.SphereGeometry(0.025, 8, 6);
    for (const side of [-1, 1]) {
      const eye = this.mesh(eyeGeo, eyeMat, head);
      eye.position.set(side * 0.06, 0.03, 0.145);
    }

    // Braços e pernas, com pivô nos ombros e quadris
    const armGeo = new THREE.CapsuleGeometry(ARM.radius, ARM.length, 4, 10);
    const legGeo = new THREE.CapsuleGeometry(LEG.radius, LEG.length, 4, 10);
    // A direita do personagem (olhando para +Z) fica em -X.
    this.limb(this.rightArm, armGeo, limbMat, -ARM.x, SHOULDER_Y, ARM.length / 2 + ARM.radius - 0.02);
    this.limb(this.leftArm, armGeo, limbMat, ARM.x, SHOULDER_Y, ARM.length / 2 + ARM.radius - 0.02);
    this.limb(this.rightLeg, legGeo, pantsMat, -LEG.x, HIP_Y, LEG.length / 2 + LEG.radius);
    this.limb(this.leftLeg, legGeo, pantsMat, LEG.x, HIP_Y, LEG.length / 2 + LEG.radius);

    const kit = { material: (c: THREE.ColorRepresentation) => this.material(c), mesh: this.mesh.bind(this) };
    buildAccessories(look, kit, head, this.body);

    // Roupas e acessórios do catálogo, presos na cabeça e na sola de cada pé.
    this.wardrobe = new Wardrobe({ head, leftFoot: this.foot(this.leftLeg), rightFoot: this.foot(this.rightLeg) });
    if (look.outfit) this.wardrobe.set(look.outfit);

    // A vara aponta para cima e a espingarda compensa o braço virado para dentro.
    this.held = new HeldItems(this.rightArm, this.leftArm, {
      handY: -(ARM.length + ARM.radius),
      rodTilt: ROD_FROM_UP - FISH_ARM_X,
      aimSpread: AIM_POSE.spreadR,
      chopArms: { left: CHOP_POSE.armL, right: CHOP_POSE.armR },
    });

    this.nameTag = new NameTag(this.root, name, color);
  }

  private material(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0 });
    this.materials.push(m);
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
    if (!this.geometries.includes(geo)) this.geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  private limb(pivot: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, drop: number): void {
    pivot.position.set(x, y, 0);
    this.body.add(pivot);
    this.mesh(geo, mat, pivot).position.y = -drop;
  }

  /** Ponto na sola do pé (embaixo da perna), que acompanha o passo. */
  private foot(leg: THREE.Group): THREE.Group {
    const foot = new THREE.Group();
    foot.position.y = -(LEG.length + LEG.radius * 2);
    leg.add(foot);
    return foot;
  }

  /** Veste roupas e acessórios do catálogo (troca só o que mudou). */
  setOutfit(outfit: Outfit): void {
    this.wardrobe.set(outfit);
  }

  /** Inicia a animação de soco (braço direito estende e volta). */
  playPunch(): void {
    this.punchElapsed = 0;
  }

  /** Reação a um soco: tranco para trás + flash branco. */
  playHit(): void {
    this.hitElapsed = 0;
  }

  /** Disparo da espingarda: coice rápido dos braços. */
  playShot(): void {
    this.held.playShot();
  }

  /** Golpe de machado: os braços descem com força e voltam a subir. */
  playChop(): void {
    this.held.playChop();
  }

  /** Exibe uma reação acima do personagem (emoji flutuante visível para todos). */
  playReaction(emoji: string): void {
    this.nameTag.playReaction(emoji);
  }

  /** @param speed velocidade horizontal (m/s), usada na frequência do passo. */
  update(dt: number, anim: AnimState, speed: number): void {
    this.time += dt;
    const k = 1 - Math.exp(-14 * dt);
    const airborne = anim === "jump";
    const fishing = anim === "fish";
    const aiming = anim === "aim";
    const chopping = anim === "chop";
    const moving = !airborne && speed > 0.3;

    // Ciclo de passos: frequência proporcional à velocidade.
    this.walkPhase += dt * speed * STRIDE;
    const running = speed > (WALK_SPEED + RUN_SPEED) / 2;
    const targetSwing = moving ? (running ? 0.95 : 0.6) : 0;
    this.swing += (targetSwing - this.swing) * k;
    const s = Math.sin(this.walkPhase) * this.swing;

    const pose: Pose = airborne
      ? { legL: -0.55, legR: -0.2, armL: -0.3, armR: -0.3, spreadL: 0.45, spreadR: 0.45 }
      : fishing
        ? { legL: 0, legR: 0, armL: -0.7, armR: FISH_ARM_X, spreadL: 0.08, spreadR: 0.08 }
        : aiming
          ? AIM_POSE
          : chopping
            ? CHOP_POSE
            : { legL: s, legR: -s, armL: -s * 0.8, armR: s * 0.8, spreadL: 0.06, spreadR: 0.06 };

    this.leftLeg.rotation.x += (pose.legL - this.leftLeg.rotation.x) * k;
    this.rightLeg.rotation.x += (pose.legR - this.rightLeg.rotation.x) * k;
    this.leftArm.rotation.x += (pose.armL - this.leftArm.rotation.x) * k;
    this.leftArm.rotation.z += (pose.spreadL - this.leftArm.rotation.z) * k;
    this.rightArm.rotation.x += (pose.armR - this.rightArm.rotation.x) * k;
    this.rightArm.rotation.z += (-pose.spreadR - this.rightArm.rotation.z) * k;

    // Respiração quando parado; leve "quique" ao correr.
    const breathe = moving || airborne ? 0 : Math.sin(this.time * 2.2) * 0.03;
    this.torso.scale.set(1 - breathe * 0.4, 1 + breathe, 1 - breathe * 0.4);
    this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06 * this.swing;

    this.updatePunch(dt);
    this.updateHit(dt);
    this.held.update(dt, anim, this.body.rotation.x);
  }

  private updatePunch(dt: number): void {
    if (this.punchElapsed >= PUNCH_ANIM_MS) {
      this.body.rotation.y *= 0.8;
      return;
    }
    this.punchElapsed += dt * 1000;
    const half = PUNCH_ANIM_MS / 2;
    const t = Math.min(this.punchElapsed, PUNCH_ANIM_MS);
    // 0 → 1 em ~150 ms (estende), 1 → 0 em ~150 ms (volta).
    const p = t < half ? t / half : 1 - (t - half) / half;
    const eased = 1 - (1 - p) * (1 - p);
    this.rightArm.rotation.x = (-Math.PI / 2) * eased;
    this.rightArm.rotation.z = 0;
    this.body.rotation.y = -0.3 * eased;
  }

  private updateHit(dt: number): void {
    if (this.hitElapsed > Math.max(HIT_FLASH_MS, HIT_JOLT_MS)) {
      this.body.rotation.x = 0;
      this.body.position.z = 0;
      this.setFlash(0);
      return;
    }
    this.hitElapsed += dt * 1000;
    const jolt = this.hitElapsed < HIT_JOLT_MS ? Math.sin((Math.PI * this.hitElapsed) / HIT_JOLT_MS) : 0;
    this.body.rotation.x = -0.35 * jolt;
    this.body.position.z = -0.12 * jolt;
    const flash = Math.max(0, 1 - this.hitElapsed / HIT_FLASH_MS);
    this.setFlash(flash * 0.9);
  }

  private setFlash(intensity: number): void {
    for (const m of this.materials) m.emissiveIntensity = intensity;
    for (const m of [...this.wardrobe.materials(), ...this.held.materials]) m.emissiveIntensity = intensity;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.nameTag.dispose();
    this.wardrobe.dispose();
    this.held.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
