import { deflateSync, inflateSync } from "node:zlib";

/**
 * An image as rows of 8-bit RGBA pixels, top row first.
 */
export interface Image {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const RGBA = 6;

interface Chunk {
  type: string;
  body: Uint8Array;
}

const readChunks = (bytes: Uint8Array): Chunk[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let at = SIGNATURE.length;
  while (at < bytes.length) {
    const length = view.getUint32(at);
    chunks.push({
      type: String.fromCharCode(...bytes.subarray(at + 4, at + 8)),
      body: bytes.subarray(at + 8, at + 8 + length),
    });
    at += 12 + length;
  }
  return chunks;
};

const paeth = (left: number, up: number, upLeft: number): number => {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
};

/**
 * Decodes the PNGs `cmux shot` writes: 8-bit RGBA, not interlaced. Anything else is refused, never guessed at.
 */
export const decodePng = (bytes: Uint8Array): Image => {
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) {
    throw new Error("not a PNG");
  }
  const chunks = readChunks(bytes);
  const header = chunks.find((chunk) => chunk.type === "IHDR")?.body;
  if (!header) {
    throw new Error("PNG without a header");
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const [width, height] = [view.getUint32(0), view.getUint32(4)];
  const [depth, colorType, interlace] = [header[8], header[9], header[12]];
  if (depth !== 8 || colorType !== RGBA || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${depth}, colour type ${colorType}, interlace ${interlace}`);
  }
  const channels = 4;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.body)));
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? rows[y * stride + i - channels] ?? 0 : 0;
      const up = y > 0 ? rows[(y - 1) * stride + i] ?? 0 : 0;
      const upLeft = y > 0 && i >= channels ? rows[(y - 1) * stride + i - channels] ?? 0 : 0;
      const predicted =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? (left + up) >> 1
              : filter === 4
                ? paeth(left, up, upLeft)
                : 0;
      rows[y * stride + i] = ((line[i] ?? 0) + predicted) & 255;
    }
  }
  return { width, height, pixels: rows };
};

const chunk = (type: string, body: Uint8Array): Uint8Array => {
  const typed = new Uint8Array([...type].map((letter) => letter.charCodeAt(0)));
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(typed, 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, Bun.hash.crc32(out.subarray(4, 8 + body.length)));
  return out;
};

/**
 * An RGBA PNG of `image`, each row unfiltered.
 */
export const encodePng = ({ width, height, pixels }: Image): Uint8Array => {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, RGBA, 0, 0, 0], 8);
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ]);
};

export const crop = (image: Image, { x, y, width, height }: Rect): Image => {
  const pixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4;
    pixels.set(image.pixels.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, pixels };
};

const CHANGE = 6;
const ALWAYS = 0.95;
// The window's rounded bottom corner, in pixels at 2x, left off so it doesn't show as a black curve.
const CORNER = 32;

const changed = (pixels: Uint8Array, a: number, b: number): boolean =>
  Math.abs((pixels[a] ?? 0) - (pixels[b] ?? 0)) +
    Math.abs((pixels[a + 1] ?? 0) - (pixels[b + 1] ?? 0)) +
    Math.abs((pixels[a + 2] ?? 0) - (pixels[b + 2] ?? 0)) >
  CHANGE;

// Whether at least ALWAYS of `count` probes change, giving up as soon as too many haven't.
const nearlyAll = (count: number, changesAt: (index: number) => boolean): boolean => {
  const allowed = Math.floor(count * (1 - ALWAYS));
  let misses = 0;
  for (let index = 0; index < count && misses <= allowed; index++) {
    misses += changesAt(index) ? 0 : 1;
  }
  return misses <= allowed;
};

/**
 * Where the right sidebar sits in a shot of a cmux window: its left edge is the first column right of the middle whose
 * colour changes from its neighbour's on nearly every row (the panel's background meets the terminal's), it starts
 * below the mode bar's border, and it stops above the window's rounded corner. Throws when no column changes on nearly
 * every row, rather than cropping the wrong part of the window.
 */
export const panelRect = ({ width, height, pixels }: Image): Rect => {
  const at = (x: number, y: number) => (y * width + x) * 4;
  const middle = Math.floor(width / 2);
  const left = Array.from({ length: width - 1 - middle }, (_, index) => middle + index).find((x) =>
    nearlyAll(height, (y) => changed(pixels, at(x - 1, y), at(x, y))),
  );
  if (left === undefined) {
    throw new Error("no panel edge found: no column changes colour on nearly every row");
  }
  const inside = width - left - 2;
  const rows = Array.from({ length: Math.floor(height * 0.15) - 1 }, (_, index) => index + 1);
  const crossesRow = (y: number) =>
    nearlyAll(inside, (index) => changed(pixels, at(left + 2 + index, y - 1), at(left + 2 + index, y)));
  const top = rows.findLast(crossesRow) ?? 0;
  return { x: left, y: top, width: width - left, height: height - top - CORNER };
};
