import * as THREE from "three";

/**
 * Classe base das árvores: materiais, geometrias e dispose.
 * Cada tipo monta o modelo em tamanho base (escala 1); a escala sorteada
 * pelo servidor é aplicada no `root`.
 */
export abstract class Tree {
  readonly root = new THREE.Group();
  /** Raio do tronco em escala 1; usado no colisor. */
  abstract readonly trunkRadius: number;
  /** Altura total em escala 1; usada no colisor. */
  abstract readonly height: number;

  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(scale: number) {
    this.root.scale.setScalar(scale);
  }

  /** Monta o modelo. Chamado pela fábrica logo após o construtor. */
  abstract build(): void;

  protected mat(color: THREE.ColorRepresentation, flatShading = false): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading });
    this.materials.push(m);
    return m;
  }

  /** Cria um mesh com sombra, registra a geometria e o adiciona ao `root`. */
  protected mesh(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial): THREE.Mesh {
    if (!this.geometries.includes(geo)) this.geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
