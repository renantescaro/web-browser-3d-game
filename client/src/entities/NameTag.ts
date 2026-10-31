// Nome flutuando acima da cabeça de um personagem e a bolha de reação (emoji) acima do nome.
import type * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { REACTION_DURATION_MS } from "@jogo/shared/constants";

const LABEL_HEIGHT = 2.05;
const REACTION_HEIGHT = 2.65;

export class NameTag {
  private readonly label: CSS2DObject;
  private readonly reactionEl: HTMLDivElement;
  private readonly reactionLabel: CSS2DObject;
  private reactionTimeout: ReturnType<typeof setTimeout> | null = null;

  /** `color` pinta a borda do rótulo. */
  constructor(parent: THREE.Object3D, name: string, color: string) {
    const el = document.createElement("div");
    el.className = "name-label";
    el.textContent = name;
    el.style.setProperty("--player-color", color);
    this.label = new CSS2DObject(el);
    this.label.position.y = LABEL_HEIGHT;
    parent.add(this.label);

    // O CSS2DRenderer sobrescreve o `style.transform` do elemento que recebe, então usamos
    // um wrapper: o renderer posiciona o wrapper, e o emoji fica no filho — sem conflito.
    const reactionWrapper = document.createElement("div");
    reactionWrapper.className = "reaction-wrapper";
    this.reactionEl = document.createElement("div");
    this.reactionEl.className = "reaction-bubble";
    reactionWrapper.appendChild(this.reactionEl);
    this.reactionLabel = new CSS2DObject(reactionWrapper);
    this.reactionLabel.position.y = REACTION_HEIGHT;
    parent.add(this.reactionLabel);
  }

  /** Exibe uma reação (emoji flutuante visível para todos). */
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

  dispose(): void {
    if (this.reactionTimeout !== null) clearTimeout(this.reactionTimeout);
    this.label.removeFromParent();
    this.label.element.remove();
    this.reactionLabel.removeFromParent();
    this.reactionLabel.element.remove();
  }
}
