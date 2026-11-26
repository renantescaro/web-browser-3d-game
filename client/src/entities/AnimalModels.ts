import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AnimalType } from "@jogo/shared/protocol";
import catUrl from "../assets/animals/cat.glb?url";
import dogUrl from "../assets/animals/dog.glb?url";
import horseUrl from "../assets/animals/horse.glb?url";

/**
 * Modelos dos animais: GLB low poly do Quaternius (CC0), gerados por
 * `scripts/convert-animals.mjs` já de frente para +Z, com os pés em y = 0 e na altura do jogo.
 */
const URLS: Record<AnimalType, string> = { dog: dogUrl, cat: catUrl, horse: horseUrl };

interface AnimalTemplate {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

export interface AnimalInstance {
  /** Cópia própria (esqueleto incluso); as geometrias são compartilhadas com o modelo. */
  object: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

let templates: Record<AnimalType, AnimalTemplate> | null = null;

export const AnimalModels = {
  /** Baixa os três modelos. Chamado na tela de entrada, junto com o WASM do Rapier. */
  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const load = async (type: AnimalType): Promise<AnimalTemplate> => {
      const gltf = await loader.loadAsync(URLS[type]);
      return { scene: gltf.scene, clips: gltf.animations };
    };
    const [dog, cat, horse] = await Promise.all([load("dog"), load("cat"), load("horse")]);
    templates = { dog, cat, horse };
  },

  instantiate(type: AnimalType): AnimalInstance {
    if (!templates) throw new Error("AnimalModels.load() ainda não terminou");
    const t = templates[type];
    return { object: cloneSkinned(t.scene), clips: t.clips };
  },
};
