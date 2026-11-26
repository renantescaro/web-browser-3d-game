import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TREE_VARIANTS } from "@jogo/shared/constants";
import { TREE_TYPES, type TreeType } from "@jogo/shared/protocol";
import treesUrl from "../../assets/trees/trees.glb?url";

/**
 * Árvores e toco do "Ultimate Nature Pack" do Quaternius (CC0), num GLB só gerado por
 * `scripts/convert-trees.mjs`: um nó por modelo (`oak_0`…, `stump`), com a base do tronco na
 * origem, em metros, e as medidas no `userData`. Geometrias e materiais são compartilhados por
 * todas as cópias e vivem enquanto a página viver.
 */
export interface TreeTemplate {
  object: THREE.Object3D;
  /** Altura total (m) em escala 1. */
  height: number;
  /** Raio do tronco (m) em escala 1. */
  trunkRadius: number;
}

let templates: Map<string, TreeTemplate> | null = null;

function readTemplate(scene: THREE.Object3D, name: string): TreeTemplate {
  const object = scene.getObjectByName(name);
  if (!object) throw new Error(`trees.glb sem o modelo ${name}`);
  const { height, trunkRadius } = object.userData as { height?: unknown; trunkRadius?: unknown };
  if (typeof height !== "number" || typeof trunkRadius !== "number") throw new Error(`trees.glb: medidas de ${name}`);
  object.removeFromParent();
  object.position.set(0, 0, 0);
  return { object, height, trunkRadius };
}

export const TreeModels = {
  /** Baixa o GLB. Chamado na tela de entrada, junto com o WASM do Rapier. */
  async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(treesUrl);
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      // O GLB vem sem normais (arquivo menor); o low poly fica facetado como no original.
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        if (m instanceof THREE.MeshStandardMaterial) m.flatShading = true;
      }
    });
    const map = new Map<string, TreeTemplate>();
    for (const type of TREE_TYPES) {
      for (let v = 0; v < TREE_VARIANTS; v++) map.set(`${type}_${v}`, readTemplate(gltf.scene, `${type}_${v}`));
    }
    map.set("stump", readTemplate(gltf.scene, "stump"));
    templates = map;
  },

  /** Modelo da árvore; variação fora da faixa cai na primeira. */
  tree(type: TreeType, variant: number): TreeTemplate {
    return this.get(`${type}_${variant}`) ?? this.require(`${type}_0`);
  },

  stump(): TreeTemplate {
    return this.require("stump");
  },

  get(name: string): TreeTemplate | undefined {
    if (!templates) throw new Error("TreeModels.load() ainda não terminou");
    return templates.get(name);
  },

  require(name: string): TreeTemplate {
    const t = this.get(name);
    if (!t) throw new Error(`modelo de árvore desconhecido: ${name}`);
    return t;
  },
};
