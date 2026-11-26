// Converte os FBX dos animais do Quaternius (CC0) nos GLB de client/src/assets/animals/.
// Uso: node scripts/convert-animals.mjs <pasta com Dog.fbx, Cat.fbx e Horse.fbx>
// (Dog e Cat vêm do "Animal Pack Vol.2"; Horse, do "Farm Animals Animated".)
//
// Cada GLB sai normalizado: de frente para +Z, pés em y = 0, centrado no XZ e na altura do
// jogo. Os materiais ganham nomes de papel (main/light/dark/pink), que o cliente tinge com a
// cor do servidor, e só ficam os clipes usados (idle e walk), cortados onde o ciclo fecha.
// Roda com o Three.js do projeto.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/** O GLTFExporter (binário) usa o FileReader do navegador; o Node só tem o Blob. */
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const QUARTER_TURN = -Math.PI / 2; // cachorro e gato olham para +X no arquivo original

const SPECS = [
  {
    file: "Dog.fbx",
    out: "dog.glb",
    height: 0.7,
    yaw: QUARTER_TURN,
    materials: { Dog: ["main", "#c8a06e"] },
    clips: { Idle: "idle", Walking: "walk" },
  },
  {
    file: "Cat.fbx",
    out: "cat.glb",
    height: 0.5,
    yaw: QUARTER_TURN,
    materials: { Grey: ["main", "#888888"], White: ["light", "#f2f2f2"], Pink: ["pink", "#f0a0b4"] },
    clips: { Idle: "idle", Walking: "walk" },
  },
  {
    file: "Horse.fbx",
    out: "horse.glb",
    height: 1.75,
    yaw: 0,
    materials: { "Material.003": ["main", "#7a4a2a"], "Material.006": ["dark", "#111111"] },
    // O "Walk" do arquivo tem 2,67 s, mas o passo acaba em 1,33 s; o resto é a mesma pose parada.
    // (Folga em 1,34: o keyframe de 1,333 s é float32 e um corte exato o descartaria.)
    clips: { Idle: "idle", Walk: { name: "walk", end: 1.34 } },
  },
];

const inputDir = process.argv[2];
if (!inputDir) {
  console.error("Uso: node scripts/convert-animals.mjs <pasta com os .fbx>");
  process.exit(1);
}
const outputDir = join(import.meta.dirname, "..", "client", "src", "assets", "animals");

for (const spec of SPECS) {
  const buf = readFileSync(join(inputDir, spec.file));
  const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");

  fbx.traverse((obj) => {
    if (!obj.isSkinnedMesh) return;
    obj.geometry.deleteAttribute("color"); // o cavalo traz cores de vértice todas brancas
    const convert = (m) => {
      const entry = spec.materials[m.name];
      if (!entry) throw new Error(`${spec.file}: material sem papel: ${m.name}`);
      return new THREE.MeshStandardMaterial({ name: entry[0], color: entry[1], roughness: 0.85 });
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(convert) : convert(obj.material);
  });

  // root (fica na origem) → inner (gira, escala e centraliza) → modelo original
  const root = new THREE.Group();
  root.name = "Animal";
  const inner = new THREE.Group();
  inner.add(fbx);
  root.add(inner);
  inner.rotation.y = spec.yaw;
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  inner.scale.setScalar(spec.height / (box.max.y - box.min.y));
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  const animations = [];
  for (const clip of fbx.animations) {
    const entry = spec.clips[clip.name.split("|").pop() ?? ""];
    if (!entry) continue;
    const { name, end } = typeof entry === "string" ? { name: entry, end: undefined } : entry;
    const copy = clip.clone();
    copy.name = name;
    if (end !== undefined) {
      copy.duration = end;
      copy.trim();
    }
    animations.push(copy);
  }

  const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations });
  writeFileSync(join(outputDir, spec.out), Buffer.from(glb));
  console.log(`${spec.out}: ${(glb.byteLength / 1024).toFixed(0)} KB, clipes ${animations.map((a) => a.name).join(", ")}`);
}
