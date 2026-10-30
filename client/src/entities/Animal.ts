import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { REACTION_DURATION_MS } from "@jogo/shared/constants";

/** Distância (m) do coração acima do ponto mais alto do animal. */
const HEART_GAP = 0.3;

/** Classe base para todos os animais: geometrias, materiais, body-bob e dispose. */
export abstract class Animal {
  readonly root = new THREE.Group();
  /** Grupo interno: todos os meshes ficam aqui para o body-bob funcionar. */
  protected readonly body = new THREE.Group();
  protected readonly materials: THREE.MeshStandardMaterial[] = [];
  protected readonly geometries: THREE.BufferGeometry[] = [];

  private walkPhase = 0;
  private heart: { label: CSS2DObject; bubble: HTMLDivElement } | null = null;
  private heartTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(protected readonly color: string) {
    this.root.add(this.body);
    this.build();
  }

  /** Constrói o modelo 3D. Chamado no constructor — subclasses implementam. */
  protected abstract build(): void;

  protected mat(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    this.materials.push(m);
    return m;
  }

  /** Cria um mesh, registra a geometria (sem duplicatas) e o adiciona ao pai. */
  protected mesh(
    geo: THREE.BufferGeometry,
    mat: THREE.MeshStandardMaterial,
    parent: THREE.Object3D = this.body,
  ): THREE.Mesh {
    if (!this.geometries.includes(geo)) this.geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** Versão mais escura da cor principal, usada em patas e detalhes. */
  protected darker(factor = 0.55): THREE.Color {
    return new THREE.Color(this.color).multiplyScalar(factor);
  }

  /**
   * Atualiza animação de caminhada (body-bob vertical).
   * @param speed Velocidade aproximada em m/s; 0 = parado.
   */
  update(dt: number, speed: number): void {
    this.walkPhase += dt * speed * 3.2;
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.028 * Math.min(speed, 1);
    this.body.position.y = bob;
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
    label.position.y = new THREE.Box3().setFromObject(this.body).max.y + HEART_GAP;
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
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
