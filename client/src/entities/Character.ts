// Pessoa simples feita de primitivas + animações procedurais + rótulo de nome.
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { PUNCH_ANIM_MS, REACTION_DURATION_MS, RUN_SPEED, WALK_SPEED } from "@jogo/shared/constants";
import type { AnimState, CharacterAppearance } from "@jogo/shared/protocol";
import { buildAccessories } from "./CharacterAccessories";
import { FishingRod } from "./FishingRod";

const SKIN_COLOR = 0xe0b48f;
const EYE_COLOR = 0x1d2733;
const HIT_FLASH_MS = 160;
const HIT_JOLT_MS = 260;
/** Quanto a fase do passo avança por metro andado (rad/m). */
const STRIDE = 2.4;
const LABEL_HEIGHT = 2.05;
const REACTION_HEIGHT = 2.65;

// Medidas (metros). A altura total fica em ~1,8.
const HIP_Y = 0.9;
const SHOULDER_Y = 1.44;
const LEG = { radius: 0.1, length: 0.7, x: 0.12 };
const ARM = { radius: 0.075, length: 0.48, x: 0.32 };
/** Pescando: inclinação do braço direito (para a frente) e da vara em relação à vertical. */
const FISH_ARM_X = -1.1;
const ROD_FROM_UP = 1.05;

/** Variação da animação conforme a ação. */
interface Pose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  spread: number;
}

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
  private readonly rod = new FishingRod();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly label: CSS2DObject;
  private readonly reactionEl: HTMLDivElement;
  private readonly reactionLabel: CSS2DObject;
  private reactionTimeout: ReturnType<typeof setTimeout> | null = null;

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

    // Vara de pescar na mão direita (só aparece pescando).
    this.rod.root.position.y = -(ARM.length + ARM.radius);
    this.rod.root.rotation.x = ROD_FROM_UP - FISH_ARM_X;
    this.rightArm.add(this.rod.root);

    // Nome flutuando acima da cabeça
    const el = document.createElement("div");
    el.className = "name-label";
    el.textContent = name;
    el.style.setProperty("--player-color", color);
    this.label = new CSS2DObject(el);
    this.label.position.y = LABEL_HEIGHT;
    this.root.add(this.label);

    // Bolha de reação acima do nome.
    // O CSS2DRenderer sobrescreve o `style.transform` do elemento que recebe, então usamos
    // um wrapper: o renderer posiciona o wrapper, e o emoji fica no filho — sem conflito.
    const reactionWrapper = document.createElement("div");
    reactionWrapper.className = "reaction-wrapper";
    this.reactionEl = document.createElement("div");
    this.reactionEl.className = "reaction-bubble";
    reactionWrapper.appendChild(this.reactionEl);
    this.reactionLabel = new CSS2DObject(reactionWrapper);
    this.reactionLabel.position.y = REACTION_HEIGHT;
    this.root.add(this.reactionLabel);
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

  /** Inicia a animação de soco (braço direito estende e volta). */
  playPunch(): void {
    this.punchElapsed = 0;
  }

  /** Reação a um soco: tranco para trás + flash branco. */
  playHit(): void {
    this.hitElapsed = 0;
  }

  /** Exibe uma reação acima do personagem (emoji flutuante visível para todos). */
  playReaction(emoji: string): void {
    if (this.reactionTimeout !== null) clearTimeout(this.reactionTimeout);
    this.reactionEl.textContent = emoji;
    this.reactionEl.classList.remove("reaction-bubble--active");
    void this.reactionEl.offsetWidth; // força reflow para reiniciar a animação
    this.reactionEl.classList.add("reaction-bubble--active");
    this.reactionTimeout = setTimeout(() => {
      this.reactionEl.classList.remove("reaction-bubble--active");
      this.reactionTimeout = null;
    }, REACTION_DURATION_MS);
  }

  /** @param speed velocidade horizontal (m/s), usada na frequência do passo. */
  update(dt: number, anim: AnimState, speed: number): void {
    this.time += dt;
    const k = 1 - Math.exp(-14 * dt);
    const airborne = anim === "jump";
    const fishing = anim === "fish";
    const moving = !airborne && speed > 0.3;

    // Ciclo de passos: frequência proporcional à velocidade.
    this.walkPhase += dt * speed * STRIDE;
    const running = speed > (WALK_SPEED + RUN_SPEED) / 2;
    const targetSwing = moving ? (running ? 0.95 : 0.6) : 0;
    this.swing += (targetSwing - this.swing) * k;
    const s = Math.sin(this.walkPhase) * this.swing;

    const pose: Pose = airborne
      ? { legL: -0.55, legR: -0.2, armL: -0.3, armR: -0.3, spread: 0.45 }
      : fishing
        ? { legL: 0, legR: 0, armL: -0.7, armR: FISH_ARM_X, spread: 0.08 }
        : { legL: s, legR: -s, armL: -s * 0.8, armR: s * 0.8, spread: 0.06 };

    this.leftLeg.rotation.x += (pose.legL - this.leftLeg.rotation.x) * k;
    this.rightLeg.rotation.x += (pose.legR - this.rightLeg.rotation.x) * k;
    this.leftArm.rotation.x += (pose.armL - this.leftArm.rotation.x) * k;
    this.leftArm.rotation.z += (pose.spread - this.leftArm.rotation.z) * k;
    this.rightArm.rotation.x += (pose.armR - this.rightArm.rotation.x) * k;
    this.rightArm.rotation.z += (-pose.spread - this.rightArm.rotation.z) * k;

    // Respiração quando parado; leve "quique" ao correr.
    const breathe = moving || airborne ? 0 : Math.sin(this.time * 2.2) * 0.03;
    this.torso.scale.set(1 - breathe * 0.4, 1 + breathe, 1 - breathe * 0.4);
    this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06 * this.swing;

    this.updatePunch(dt);
    this.updateHit(dt);
    this.updateRod(dt, fishing);
  }

  /** Mostra a vara pescando e mantém a linha pendendo na vertical. */
  private updateRod(dt: number, fishing: boolean): void {
    this.rod.root.visible = fishing;
    if (!fishing) return;
    this.rod.setLineAngle(-(this.rod.root.rotation.x + this.rightArm.rotation.x + this.body.rotation.x));
    this.rod.update(dt);
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
      for (const m of this.materials) m.emissiveIntensity = 0;
      return;
    }
    this.hitElapsed += dt * 1000;
    const jolt = this.hitElapsed < HIT_JOLT_MS ? Math.sin((Math.PI * this.hitElapsed) / HIT_JOLT_MS) : 0;
    this.body.rotation.x = -0.35 * jolt;
    this.body.position.z = -0.12 * jolt;
    const flash = Math.max(0, 1 - this.hitElapsed / HIT_FLASH_MS);
    for (const m of this.materials) m.emissiveIntensity = flash * 0.9;
  }

  dispose(): void {
    if (this.reactionTimeout !== null) clearTimeout(this.reactionTimeout);
    this.root.removeFromParent();
    this.label.removeFromParent();
    this.label.element.remove();
    this.reactionLabel.removeFromParent();
    this.reactionLabel.element.remove();
    this.rod.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
