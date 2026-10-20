/**
 * 以 assets/极简 Markdown 编辑器图标.png（用户提供的方形图片）生成应用图标。
 * 源图为「深色圆角方块图标 + mojian 字样」的竖版排版：
 * 1) 从四周边框泛洪，把纯白背景抠成透明（图标自身的白色部分不受影响）；
 * 2) 找出图标本体所在的行带（排除下方字样），取本体包围盒；
 * 3) 等比缩放并居中放入正方形画布（不变形，四周留白透明）；
 * 4) 输出 PNG 与多尺寸 ICO。
 * 产物：build/icon.png、build/icon.ico、src/assets/icon.png
 */
'use strict';

const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs');

const SIZE = 1024;
const WHITE = 248; // 亮度高于该值的像素视为背景白
const DARK = 140; // 低于该亮度的像素视为深色本体，用于区分图标与下方字样
const BAND_SHARE = 0.02; // 某一行/列中本体像素占比超过该值才算本体，避免噪点

async function buildIcon() {
  const src = path.join(__dirname, '..', 'assets', '极简 Markdown 编辑器图标.png');
  // 只解码一次：抠底、定位、裁切都用这份像素
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const CH = info.channels;
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  // ---- 1) 把外部白底泛洪成透明 ----
  const seen = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (seen[p]) return;
    if (lum(p * CH) < WHITE) return; // 不是白底，停止
    seen[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }
  while (stack.length) {
    const p = stack.pop();
    data[p * CH + 3] = 0; // 透明
    const x = p % W;
    const y = (p - x) / W;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  // ---- 2) 定位图标本体：按行统计深色像素，取最厚的一条行带（排除下方字样） ----
  const rowDark = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    let c = 0;
    for (let x = 0; x < W; x++) if (lum((y * W + x) * CH) < DARK) c++;
    rowDark[y] = c;
  }
  const rowMin = Math.max(20, Math.ceil(W * BAND_SHARE));
  const bands = [];
  let start = -1;
  for (let y = 0; y < H; y++) {
    const on = rowDark[y] >= rowMin;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      bands.push([start, y - 1]);
      start = -1;
    }
  }
  if (start >= 0) bands.push([start, H - 1]);
  if (!bands.length) throw new Error('未在源图中找到图标区域');
  const [top, bottom] = bands.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));

  // 在本体行带内按列统计不透明像素，取占比达标的列区间为包围盒
  const inBand = bottom - top + 1;
  const colOpaque = new Array(W).fill(0);
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < W; x++) if (data[(y * W + x) * CH + 3] > 0) colOpaque[x]++;
  }
  const colMin = Math.max(1, Math.ceil(inBand * BAND_SHARE));
  let minX = -1;
  let maxX = -1;
  for (let x = 0; x < W; x++) {
    if (colOpaque[x] >= colMin) {
      if (minX < 0) minX = x;
      maxX = x;
    }
  }
  if (maxX < 0) throw new Error('未在源图中找到图标区域');

  // ---- 3) 裁切本体，等比居中放入正方形画布 ----
  const png = await sharp(data, { raw: { width: W, height: H, channels: CH } })
    .extract({ left: minX, top, width: maxX - minX + 1, height: inBand })
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const assetsDir = path.join(__dirname, '..', 'src', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), png);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const tmpDir = path.join(__dirname, '.ico-tmp');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const parts = [];
  for (const size of sizes) {
    const file = path.join(tmpDir, `icon-${size}.png`);
    await sharp(png).resize(size, size).png().toFile(file);
    parts.push(file);
  }
  const pngToIco = (await import('png-to-ico')).default;
  const ico = await pngToIco(parts);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(
    `icon.png 已生成（${SIZE}x${SIZE}, 本体 ${maxX - minX + 1}x${inBand} @ ${minX},${top}, ${(png.length / 1024).toFixed(1)} KB）`
  );
  console.log(`icon.ico 已生成（${sizes.join('/')}, ${(ico.length / 1024).toFixed(1)} KB）`);
}

buildIcon().catch((err) => {
  console.error(err);
  process.exit(1);
});
