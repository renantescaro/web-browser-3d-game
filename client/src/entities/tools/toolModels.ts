// Modelo 3D de cada ferramenta do catálogo (`shared/src/tools.ts`), feito de primitivas.
// Ferramenta nova: crie a função aqui e registre em `TOOL_MODELS` (o tipo obriga a ter todas).
import * as THREE from "three";
import type { ToolId } from "@jogo/shared/tools";

/** Quem cria e guarda os recursos da ferramenta (ex.: um `WornItem`). */
export interface ToolKit {
  material(color: THREE.ColorRepresentation, options?: THREE.MeshStandardMaterialParameters): THREE.Material;
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D): THREE.Mesh;
}

/**
 * Monta a ferramenta dentro de `parent`. A origem é a ponta de baixo do cabo, o cabo sobe em +Y
 * e a parte de trabalho (lâmina, cabeça) fica em cima, virada para +X.
 */
export type ToolFactory = (kit: ToolKit, parent: THREE.Object3D) => void;

const AXE = {
  handleLength: 0.7,
  handleRadius: 0.02,
  woodColor: 0x9c6b3c,
  headColor: 0x6c757d,
  edgeColor: 0xdfe3e8,
} as const;

/** Machado: cabo de madeira, cabeça de ferro e o fio da lâmina mais claro. */
function axe(kit: ToolKit, parent: THREE.Object3D): void {
  const wood = kit.material(AXE.woodColor, { roughness: 0.8 });
  const iron = kit.material(AXE.headColor, { roughness: 0.4, metalness: 0.6 });
  const edge = kit.material(AXE.edgeColor, { roughness: 0.25, metalness: 0.8 });
  const top = AXE.handleLength - 0.06;

  const handle = kit.mesh(new THREE.CylinderGeometry(AXE.handleRadius * 0.9, AXE.handleRadius, AXE.handleLength, 8), wood, parent);
  handle.position.y = AXE.handleLength / 2;
  const head = kit.mesh(new THREE.BoxGeometry(0.13, 0.09, 0.035), iron, parent);
  head.position.set(0.045, top, 0);
  const blade = kit.mesh(new THREE.BoxGeometry(0.035, 0.17, 0.025), edge, parent);
  blade.position.set(0.125, top, 0);
  const poll = kit.mesh(new THREE.BoxGeometry(0.035, 0.07, 0.04), iron, parent);
  poll.position.set(-0.035, top, 0);
}

export const TOOL_MODELS: Record<ToolId, ToolFactory> = { axe };
