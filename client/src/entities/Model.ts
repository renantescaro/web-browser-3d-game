import * as THREE from "three";

/** Base dos modelos estáticos feitos de primitivas: registra recursos e faz o dispose. */
export abstract class Model {
  readonly root = new THREE.Group();
  private readonly disposables = new Set<{ dispose(): void }>();

  protected mat(color: THREE.ColorRepresentation, flatShading = false, roughness = 0.9): THREE.MeshStandardMaterial {
    return this.track(new THREE.MeshStandardMaterial({ color, roughness, flatShading }));
  }

  /** Registra um recurso (geometria, material, textura) para o `dispose()`. */
  protected track<T extends { dispose(): void }>(resource: T): T {
    this.disposables.add(resource);
    return resource;
  }

  /** Cria um mesh com sombra, registra geometria e material e o adiciona ao pai. */
  protected mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.root): THREE.Mesh {
    this.track(geo);
    this.track(mat);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.disposables.clear();
  }
}
