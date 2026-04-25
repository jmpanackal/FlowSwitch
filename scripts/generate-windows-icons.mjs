/**
 * Regenerates FlowSwitch logo variants plus the app/website assets that consume them.
 *
 * Source master:
 * - branding/flowswitch-logo-master.png
 *
 * Live outputs:
 * - public/flowswitch-logo.png
 * - public/flowswitch-taskbar.png
 * - public/flowswitch.ico
 * - website/assets/flowswitch-logo.png
 * - website/flowswitch-logo.png
 * - website/assets/favicon-64.png
 * - website/favicon.ico
 *
 * Variant exports:
 * - branding/generated/*.png
 *
 * Run: npm run icons:generate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const brandingDir = path.join(root, 'branding');
const generatedDir = path.join(brandingDir, 'generated');
const publicDir = path.join(root, 'public');
const websiteDir = path.join(root, 'website');
const websiteAssetsDir = path.join(websiteDir, 'assets');
const inputPath = path.join(brandingDir, 'flowswitch-logo-master.png');

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const brandBlueTop = '#39adff';
const brandBlueBottom = '#156cff';
const brandGray = '#c1c7d0';

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function superellipsePath(size, exponent = 4.8, inset = 0) {
  const half = size / 2;
  const radius = half - inset;
  const points = [];
  const stepsPerQuarter = 20;

  for (let i = 0; i <= stepsPerQuarter * 4; i += 1) {
    const theta = (Math.PI * 2 * i) / (stepsPerQuarter * 4);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const x = half + radius * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exponent);
    const y = half + radius * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exponent);
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return `${points.join(' ')} Z`;
}

function svgForShape(size, shape, fillMode = 'gradient') {
  const fill =
    fillMode === 'gradient'
      ? 'url(#brandGradient)'
      : fillMode === 'black'
        ? '#000000'
        : fillMode === 'gray'
          ? brandGray
          : fillMode;

  let body = '';
  if (shape === 'rounded-square') {
    const radius = Math.round(size * 0.23);
    body = `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${fill}" />`;
  } else if (shape === 'circle') {
    body = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}" />`;
  } else if (shape === 'squircle') {
    body = `<path d="${superellipsePath(size)}" fill="${fill}" />`;
  } else if (shape === 'square') {
    body = `<rect x="0" y="0" width="${size}" height="${size}" fill="${fill}" />`;
  } else {
    throw new Error(`Unsupported shape: ${shape}`);
  }

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${brandBlueTop}" />
          <stop offset="100%" stop-color="${brandBlueBottom}" />
        </linearGradient>
      </defs>
      ${body}
    </svg>
  `);
}

/** Assumes standard PNG layout: signature + IHDR chunk first. */
function readPngDimensions(buf) {
  if (buf.length < 24) throw new Error('PNG buffer too small');
  if (buf.readUInt32BE(12) !== 0x49484452) {
    throw new Error('Expected IHDR as first chunk; re-encode the master PNG or extend the parser.');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Windows Vista+ ICO: ICONDIR + ICONDIRENTRY + raw PNG payload per size. */
function buildIcoFromPngBuffers(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dir = [];
  let dataOffset = 6 + count * 16;
  for (const png of pngBuffers) {
    const { width: w, height: h } = readPngDimensions(png);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(w >= 256 ? 0 : w, 0);
    entry.writeUInt8(h >= 256 ? 0 : h, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    dir.push(entry);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dir, ...pngBuffers]);
}

async function extractMarkWhiteBuffer() {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = data[i + 3];

    const minRgb = Math.min(r, g, b);
    const whiteness = clampByte(((minRgb - 150) / 105) * 255);
    const outAlpha = clampByte((whiteness * alpha) / 255);

    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = outAlpha;
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim()
    .png()
    .toBuffer();
}

async function tintMark(markWhiteBuffer, color) {
  const { width, height } = await sharp(markWhiteBuffer).metadata();
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  })
    .composite([{ input: markWhiteBuffer, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function resizeMark(markBuffer, size, ratio, sharpen = false) {
  const target = Math.max(1, Math.round(size * ratio));
  let pipeline = sharp(markBuffer)
    .ensureAlpha()
    .resize(target, target, { fit: 'contain', background: transparent });

  if (sharpen) pipeline = pipeline.sharpen();
  return pipeline.png().toBuffer();
}

async function composeLogo({
  size,
  shape = null,
  fillMode = 'gradient',
  markBuffer,
  markRatio = 0.78,
  background = transparent,
  sharpenMark = false,
}) {
  const base = shape
    ? await sharp(svgForShape(size, shape, fillMode)).png().toBuffer()
    : await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background,
      },
    }).png().toBuffer();

  const mark = await resizeMark(markBuffer, size, markRatio, sharpenMark);
  return sharp(base)
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function writePng(filePath, buffer) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
}

async function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing source: ${inputPath}`);
    process.exit(1);
  }

  ensureDir(generatedDir);
  ensureDir(publicDir);
  ensureDir(websiteAssetsDir);

  const markWhite = await extractMarkWhiteBuffer();
  const markBlue = await tintMark(markWhite, { r: 21, g: 108, b: 255, alpha: 1 });
  const markBlack = await tintMark(markWhite, { r: 0, g: 0, b: 0, alpha: 1 });

  const sizeConfigs = [
    { size: 1024, ratio: 0.78, sharpen: false },
    { size: 512, ratio: 0.79, sharpen: false },
    { size: 256, ratio: 0.8, sharpen: false },
    { size: 128, ratio: 0.81, sharpen: false },
    { size: 64, ratio: 0.83, sharpen: true },
    { size: 32, ratio: 0.86, sharpen: true },
    { size: 16, ratio: 0.9, sharpen: true },
  ];

  const roundedSquareBySize = new Map();
  for (const { size, ratio, sharpen } of sizeConfigs) {
    const buffer = await composeLogo({
      size,
      shape: 'rounded-square',
      fillMode: 'gradient',
      markBuffer: markWhite,
      markRatio: ratio,
      sharpenMark: sharpen,
    });
    roundedSquareBySize.set(size, buffer);
    await writePng(path.join(generatedDir, `size-rounded-square-${size}.png`), buffer);
  }

  const primaryRounded1024 = roundedSquareBySize.get(1024);
  const circle1024 = await composeLogo({
    size: 1024,
    shape: 'circle',
    fillMode: 'gradient',
    markBuffer: markWhite,
    markRatio: 0.76,
  });
  const squircle1024 = await composeLogo({
    size: 1024,
    shape: 'squircle',
    fillMode: 'gradient',
    markBuffer: markWhite,
    markRatio: 0.78,
  });
  const square1024 = await composeLogo({
    size: 1024,
    shape: 'square',
    fillMode: 'gradient',
    markBuffer: markWhite,
    markRatio: 0.8,
  });
  const symbolBlue1024 = await composeLogo({
    size: 1024,
    markBuffer: markBlue,
    markRatio: 0.86,
  });
  const invertedBlackSquare1024 = await composeLogo({
    size: 1024,
    shape: 'square',
    fillMode: 'black',
    markBuffer: markWhite,
    markRatio: 0.8,
  });
  const lightGraySquare1024 = await composeLogo({
    size: 1024,
    shape: 'square',
    fillMode: 'gray',
    markBuffer: markWhite,
    markRatio: 0.8,
  });
  const solidBlackMark1024 = await composeLogo({
    size: 1024,
    markBuffer: markBlack,
    markRatio: 0.86,
  });
  const solidWhiteMark1024 = await composeLogo({
    size: 1024,
    markBuffer: markWhite,
    markRatio: 0.86,
  });

  await writePng(path.join(generatedDir, 'primary-rounded-square.png'), primaryRounded1024);
  await writePng(path.join(generatedDir, 'circle.png'), circle1024);
  await writePng(path.join(generatedDir, 'squircle.png'), squircle1024);
  await writePng(path.join(generatedDir, 'square.png'), square1024);
  await writePng(path.join(generatedDir, 'symbol-blue-mark.png'), symbolBlue1024);
  await writePng(path.join(generatedDir, 'inverted-black-square.png'), invertedBlackSquare1024);
  await writePng(path.join(generatedDir, 'light-gray-square.png'), lightGraySquare1024);
  await writePng(path.join(generatedDir, 'solid-black-mark.png'), solidBlackMark1024);
  await writePng(path.join(generatedDir, 'solid-white-mark.png'), solidWhiteMark1024);

  fs.writeFileSync(path.join(publicDir, 'flowswitch-logo.png'), primaryRounded1024);
  fs.writeFileSync(path.join(websiteAssetsDir, 'flowswitch-logo.png'), primaryRounded1024);
  fs.writeFileSync(path.join(websiteDir, 'flowswitch-logo.png'), primaryRounded1024);

  // HWND / taskbar: same buffer as primary 1024 rounded logo (matches master proportions).
  fs.writeFileSync(path.join(publicDir, 'flowswitch-taskbar.png'), primaryRounded1024);

  // ICO sizes: same mark-vs-tile ratios as `sizeConfigs` (derived from master), slightly
  // bolder only for small frames so tiny exe/jump-list pixels stay readable.
  const markRatioForExeIcoSize = (size) => {
    if (size >= 256) return 0.8;
    if (size >= 128) return 0.81;
    if (size >= 64) return 0.83;
    if (size >= 48) return 0.84;
    if (size >= 32) return 0.86;
    if (size >= 24) return 0.87;
    return 0.9;
  };

  // Largest size first: index 0 must be the primary frame (taskbar / jump-list app row).
  const icoSizes = [256, 128, 64, 48, 32, 24, 16];
  const publicIco = buildIcoFromPngBuffers(
    await Promise.all(icoSizes.map((size) => composeLogo({
      size,
      shape: 'rounded-square',
      fillMode: 'gradient',
      markBuffer: markWhite,
      markRatio: markRatioForExeIcoSize(size),
      sharpenMark: size <= 64,
    }))),
  );
  fs.writeFileSync(path.join(publicDir, 'flowswitch.ico'), publicIco);

  const favicon64 = await composeLogo({
    size: 64,
    shape: 'squircle',
    fillMode: 'gradient',
    markBuffer: markWhite,
    markRatio: 0.84,
    sharpenMark: true,
  });
  fs.writeFileSync(path.join(websiteAssetsDir, 'favicon-64.png'), favicon64);

  const faviconIco = buildIcoFromPngBuffers(
    await Promise.all([64, 48, 32, 16].map((size) => composeLogo({
      size,
      shape: 'squircle',
      fillMode: 'gradient',
      markBuffer: markWhite,
      markRatio: size <= 16 ? 0.9 : size <= 32 ? 0.86 : 0.84,
      sharpenMark: true,
    }))),
  );
  fs.writeFileSync(path.join(websiteDir, 'favicon.ico'), faviconIco);

  console.log('Wrote public/flowswitch-logo.png');
  console.log('Wrote public/flowswitch-taskbar.png');
  console.log('Wrote public/flowswitch.ico');
  console.log('Synced website logo assets');
  console.log('Wrote website/favicon.ico and website/assets/favicon-64.png');
  console.log('Wrote branding/generated logo variants');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
