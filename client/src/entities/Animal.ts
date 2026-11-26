import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { REACTION_DURATION_MS } from "@jogo/shared/constants";
import type { AnimalType } from "@jogo/shared/protocol";
import { AnimalModels } from "./AnimalModels";

/** Distância (m) do coração acima do ponto mais alto do animal. */
const HEART_GAP = 0.3;
/** Rapidez (1/s) da troca entre as animações parado ↔ andando. */
const BLEND_RATE = 6;
/** Velocidade (m/s) em que a animação de andar toca no ritmo original. */
const WALK_CLIP_SPEED = 2;

/**
 * Tinge cada material do modelo pelo papel (nome dado na conversão), a partir da cor do servidor.
 * Papel sem regra (ex.: `pink`, o focinho do gato) mantém a cor do arquivo.
 */
const TINTS: Record<string, (base: THREE.Color) => THREE.Color> = {
  main: (base) => base,
  light: (base) => base.clone().lerp(new THREE.Color(0xffffff), 0.7),
  dark: (base) => base.clone().multiplyScalar(0.3),
};

/** Animal (cachorro, gato ou cavalo): modelo animado por esqueleto, coração e dispose. */
export class Animal {
  readonly root = new THREE.Group();
  private readonly materials: THREE.Material[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction | null;
  private readonly walk: THREE.AnimationAction | null;
  private walkWeight = 0;
  private heart: { label: CSS2DObject; bubble: HTMLDivElement } | null = null;
  private heartTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(type: AnimalType, color: string) {
    const { object, clips } = AnimalModels.instantiate(type);
    const base = new THREE.Color(color);
    object.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const tint = (m: THREE.Material): THREE.Material => {
        const copy = m.clone();
        const rule = TINTS[m.name];
        if (rule && copy instanceof THREE.MeshStandardMaterial) copy.color.copy(rule(base));
        this.materials.push(copy);
        return copy;
      };
      obj.material = Array.isArray(obj.material) ? obj.material.map(tint) : tint(obj.material);
    });
    this.root.add(object);

    this.mixer = new THREE.AnimationMixer(object);
    const action = (name: string): THREE.AnimationAction | null => {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) return null;
      const a = this.mixer.clipAction(clip);
      a.play();
      // Começa em um ponto aleatório do ciclo para os animais não andarem sincronizados.
      a.time = Math.random() * clip.duration;
      return a;
    };
    this.idle = action("idle");
    this.walk = action("walk");
    this.applyWeights();
  }

  /**
   * Mistura as animações parado/andando e avança o esqueleto.
   * @param speed Velocidade aproximada em m/s; 0 = parado.
   */
  update(dt: number, speed: number): void {
    const target = speed > 0 ? 1 : 0;
    this.walkWeight += (target - this.walkWeight) * Math.min(1, dt * BLEND_RATE);
    if (this.walk && speed > 0) this.walk.timeScale = speed / WALK_CLIP_SPEED;
    this.applyWeights();
    this.mixer.update(dt);
  }

  private applyWeights(): void {
    this.idle?.setEffectiveWeight(1 - this.walkWeight);
    this.walk?.setEffectiveWeight(this.walkWeight);
  }

  /** Coração que surge acima do animal (ganhou peixe). Usa a mesma animação das reações. */
  playHeart(): void {
    const heart = this.heart ?? this.createHeart();
    if (this.heartTimeout !== null) clearTimeout(this.heartTimeout);
    heart.bubble.classList.remove("reaction-bubble--active");
    void heart.bubble.offsetWidth; // força reflow para reiniciar a animação
    heart.bubble.classList.add("reaction-bubble--active");
    this.heartTimeout = setTimeout(() => {
      heart.bubble.classList.remove("reaction-bubble--active");
      this.heartTimeout = null;
    }, REACTION_DURATION_MS);
  }

  private createHeart(): { label: CSS2DObject; bubble: HTMLDivElement } {
    // O CSS2DRenderer sobrescreve o transform do wrapper; a animação fica no filho.
    const wrapper = document.createElement("div");
    wrapper.className = "reaction-wrapper";
    const bubble = document.createElement("div");
    bubble.className = "reaction-bubble";
    bubble.textContent = "❤️";
    wrapper.appendChild(bubble);
    const label = new CSS2DObject(wrapper);
    // Medido em coordenadas locais (o root pode estar girado ou longe da origem).
    const top = new THREE.Box3().setFromObject(this.root).max.y - this.root.position.y;
    label.position.y = top + HEART_GAP;
    this.root.add(label);
    this.heart = { label, bubble };
    return this.heart;
  }

  dispose(): void {
    if (this.heartTimeout !== null) clearTimeout(this.heartTimeout);
    if (this.heart) {
      this.heart.label.removeFromParent();
      this.heart.label.element.remove();
    }
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.root.removeFromParent();
    // As geometrias são do modelo compartilhado (AnimalModels) e vivem enquanto a página viver.
    for (const m of this.materials) m.dispose();
  }
}
