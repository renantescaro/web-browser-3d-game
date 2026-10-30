import * as THREE from "three";

/** Desenha um texto centralizado num canvas de madeira clara com moldura e o usa como textura. */
export function createWoodTextTexture(text: string, width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#c89b62";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#5c3b1e";
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, width - 14, height - 14);
    ctx.fillStyle = "#3b2512";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = Math.round(height * 0.5);
    do {
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      size -= 6;
    } while (ctx.measureText(text).width > width * 0.88 && size > 20);
    ctx.fillText(text, width / 2, height / 2 + 6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
