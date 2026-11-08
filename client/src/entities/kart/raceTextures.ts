import * as THREE from "three";

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function checker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, size: number): void {
  for (let row = 0; row * size < h; row++) {
    for (let col = 0; col * size < w; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#111111" : "#f4f4f4";
      ctx.fillRect(x + col * size, y + row * size, Math.min(size, w - col * size), Math.min(size, h - row * size));
    }
  }
}

/** Xadrez preto e branco de `cols` × `rows` casas (linha de chegada, bandeira). */
export function createCheckerTexture(cols: number, rows: number): THREE.CanvasTexture {
  const size = 32;
  const texture = canvasTexture(cols * size, rows * size, (ctx) => checker(ctx, 0, 0, cols * size, rows * size, size));
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** Faixa de corrida: fundo vermelho, texto branco e listras quadriculadas em cima e embaixo. */
export function createBannerTexture(text: string, width: number, height: number): THREE.CanvasTexture {
  return canvasTexture(width, height, (ctx) => {
    ctx.fillStyle = "#c1121f";
    ctx.fillRect(0, 0, width, height);
    const band = Math.round(height * 0.14);
    checker(ctx, 0, 0, width, band, band / 2);
    checker(ctx, 0, height - band, width, band, band / 2);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = Math.round(height * 0.5);
    do {
      ctx.font = `italic 900 ${size}px system-ui, sans-serif`;
      size -= 6;
    } while (ctx.measureText(text).width > width * 0.9 && size > 20);
    ctx.fillText(text, width / 2, height / 2 + 4);
  });
}
