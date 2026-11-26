// Converte as árvores e o toco do "Ultimate Nature Pack" do Quaternius (CC0) em
// client/src/assets/trees/trees.glb.
// Uso: node scripts/convert-trees.mjs <pasta FBX do pacote>
//
// Cada modelo vira um nó do GLB chamado `<tipo>_<variação>` (ex.: `oak_0`) ou `stump`, com a
// base do tronco na origem e em metros. A altura e o raio do tronco vão em `extras` (o cliente
// lê como `userData`) para os colisores. As normais saem do arquivo (o cliente usa flatShading),
// o que deixa os vértices compartilháveis e o arquivo bem menor. Os materiais são únicos por nome.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** O GLTFExporter (binário) usa o FileReader do navegador; o Node só tem o Blob. */
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

/** Metros por unidade do pacote (o CommonTree_1 fica com ~4 m). */
const METERS_PER_UNIT = 0.016;
/** Tipo do jogo (TREE_TYPES) → prefixo do arquivo; 5 variações de cada (TREE_VARIANTS). */
const TYPES = { oak: "CommonTree", pine: "PineTree", birch: "BirchTree" };
const VARIANTS = 5;
/** Materiais da casca (o tronco é medido só com eles). */
const BARK = new Set(["Wood", "White", "Black"]);

const inputDir = process.argv[2];
if (!inputDir) {
  console.error("Uso: node scripts/convert-trees.mjs <pasta com os .fbx>");
  process.exit(1);
}
const output = join(import.meta.dirname, "..", "client", "src", "assets", "trees", "trees.glb");

/** Alguns arquivos repetem o material com sufixo do Blender (`White.001`). */
const baseName = (name) => name.replace(/\.\d+$/, "");

const materials = new Map();
function material(source) {
  const name = baseName(source.name);
  let m = materials.get(name);
  if (!m) {
    // O Blender grava a cor do FBX já linear, mas o FBXLoader a trata como sRGB e converte de
    // novo (fica quase preta): desfaz essa conversão.
    const raw = source.color.clone().convertLinearToSRGB();
    const color = new THREE.Color().setRGB(raw.r, raw.g, raw.b, THREE.LinearSRGBColorSpace);
    m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.9 });
    materials.set(name, m);
  }
  return m;
}

/** Junta os triângulos por material: um grupo (um draw call) por material, não dezenas. */
function groupByMaterial(geo, sourceMaterials) {
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index.count, materialIndex: 0 }];
  const byName = new Map();
  for (const g of groups) {
    const mat = material(sourceMaterials[g.materialIndex]);
    const list = byName.get(mat) ?? [];
    for (let i = g.start; i < g.start + g.count; i++) list.push(geo.index.getX(i));
    byName.set(mat, list);
  }
  const index = [];
  const mats = [];
  geo.clearGroups();
  for (const [mat, list] of byName) {
    geo.addGroup(index.length, list.length, mats.length);
    index.push(...list);
    mats.push(mat);
  }
  geo.setIndex(index);
  return mats;
}

/** Lê um FBX e devolve um único Mesh em metros, com a geometria já transformada. */
function loadMesh(file) {
  const buf = readFileSync(join(inputDir, file));
  const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  fbx.scale.setScalar(METERS_PER_UNIT);
  fbx.updateMatrixWorld(true);
  const meshes = [];
  fbx.traverse((o) => o.isMesh && meshes.push(o));
  if (meshes.length !== 1) throw new Error(`${file}: esperava 1 mesh, achei ${meshes.length}`);
  const src = meshes[0];
  let geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
  for (const name of Object.keys(geo.attributes)) if (name !== "position") geo.deleteAttribute(name);
  geo = mergeVertices(geo);
  const mats = groupByMaterial(geo, Array.isArray(src.material) ? src.material : [src.material]);
  return new THREE.Mesh(geo, mats);
}

/**
 * Centro (XZ) e raio do tronco, medidos nos vértices da casca numa faixa de altura (fração da
 * altura total; por padrão desde o chão, pois o tronco do pinheiro só tem os anéis da base e do topo).
 */
function measureTrunk(mesh, band = [0, 0.12]) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const index = geo.index;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  geo.computeBoundingBox();
  const height = geo.boundingBox.max.y - geo.boundingBox.min.y;
  const low = geo.boundingBox.min.y + height * band[0];
  const high = geo.boundingBox.min.y + height * band[1];
  const pts = [];
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: index.count, materialIndex: 0 }];
  for (const g of groups) {
    if (!BARK.has(mats[g.materialIndex]?.name)) continue;
    for (let i = g.start; i < g.start + g.count; i++) {
      const v = index.getX(i);
      const y = pos.getY(v);
      if (y >= low && y <= high) pts.push([pos.getX(v), pos.getZ(v)]);
    }
  }
  if (pts.length === 0) throw new Error(`${mesh.name}: tronco não encontrado`);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const radius = ((Math.max(...xs) - Math.min(...xs)) + (Math.max(...zs) - Math.min(...zs))) / 4;
  return { cx, cz, minY: geo.boundingBox.min.y, height, radius };
}

/** Põe a base do tronco na origem e guarda as medidas no userData. */
function place(mesh, name, band) {
  const t = measureTrunk(mesh, band);
  mesh.geometry.translate(-t.cx, -t.minY, -t.cz);
  mesh.name = name;
  mesh.userData = { height: round(t.height), trunkRadius: round(t.radius) };
  return mesh;
}

const round = (n) => Math.round(n * 1000) / 1000;

const root = new THREE.Group();
root.name = "Trees";
for (const [type, prefix] of Object.entries(TYPES)) {
  for (let v = 0; v < VARIANTS; v++) {
    const mesh = place(loadMesh(`${prefix}_${v + 1}.fbx`), `${type}_${v}`);
    root.add(mesh);
    console.log(`${mesh.name}: altura ${mesh.userData.height} m, raio do tronco ${mesh.userData.trunkRadius} m`);
  }
}
// O toco tem raízes largas no chão: mede o tronco mais acima.
const stump = place(loadMesh("TreeStump.fbx"), "stump", [0.25, 0.4]);
root.add(stump);
console.log(`stump: altura ${stump.userData.height} m, raio ${stump.userData.trunkRadius} m`);

const glb = await new GLTFExporter().parseAsync(root, { binary: true });
writeFileSync(output, Buffer.from(glb));
console.log(`trees.glb: ${(glb.byteLength / 1024).toFixed(0)} KB`);
