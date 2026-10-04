// A small QR code encoder: byte mode, error correction level M, versions 1 to 6
// (up to 106 bytes), which covers a shop link with room to spare. Written here
// because the page ships without third-party UI dependencies.

/** Error-correction codewords per block, blocks, and data codewords, indexed by version. */
const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4];
const DATA_CODEWORDS = [0, 16, 28, 44, 64, 86, 108];
const MAX_VERSION = 6;

export type QrMatrix = boolean[][];

/** Returns the modules as rows of booleans (true = dark), without a quiet zone. */
export function encodeQr(text: string): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  while (version <= MAX_VERSION && bytes.length > DATA_CODEWORDS[version] - 2) version++;
  if (version > MAX_VERSION) throw new Error(`Text is too long for a QR code here (${bytes.length} bytes)`);

  const codewords = addErrorCorrection(dataCodewords(bytes, version), version);
  const size = 17 + 4 * version;
  const modules: QrMatrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved: QrMatrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  drawFunctionPatterns(size, version, set);
  drawCodewords(size, modules, reserved, codewords);

  let best = { mask: 0, penalty: Infinity };
  for (let mask = 0; mask < 8; mask++) {
    applyMask(size, modules, reserved, mask);
    drawFormatBits(size, mask, set);
    const penalty = penaltyScore(size, modules);
    if (penalty < best.penalty) best = { mask, penalty };
    applyMask(size, modules, reserved, mask); // undo: masking is its own inverse
  }
  applyMask(size, modules, reserved, best.mask);
  drawFormatBits(size, best.mask, set);
  return modules;
}

function dataCodewords(bytes: number[], version: number): number[] {
  const capacityBits = DATA_CODEWORDS[version] * 8;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    out.push(byte);
  }
  return out;
}

function addErrorCorrection(data: number[], version: number): number[] {
  const blockCount = BLOCKS[version];
  const ecLength = EC_PER_BLOCK[version];
  const blockLength = data.length / blockCount;
  const divisor = reedSolomonDivisor(ecLength);

  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < blockCount; b++) {
    const block = data.slice(b * blockLength, (b + 1) * blockLength);
    blocks.push(block);
    ecBlocks.push(reedSolomonRemainder(block, divisor));
  }

  const out: number[] = [];
  for (let i = 0; i < blockLength; i++) for (const block of blocks) out.push(block[i]);
  for (let i = 0; i < ecLength; i++) for (const block of ecBlocks) out.push(block[i]);
  return out;
}

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, i) => {
      result[i] ^= gfMultiply(coefficient, factor);
    });
  }
  return result;
}

type Setter = (x: number, y: number, dark: boolean) => void;

function drawFunctionPatterns(size: number, version: number, set: Setter): void {
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Finder patterns with their separators, in three corners.
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, distance !== 2 && distance !== 4);
      }
    }
  }

  // Versions 2 to 6 have a single alignment pattern near the bottom-right corner.
  if (version >= 2) {
    const c = size - 7;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  drawFormatBits(size, 0, set); // reserves the format area; real bits are drawn once a mask is chosen
}

function drawFormatBits(size: number, mask: number, set: Setter): void {
  const data = mask; // error correction level M is 00, so the 5 data bits are just the mask
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));

  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the fixed dark module
}

function drawCodewords(size: number, modules: QrMatrix, reserved: QrMatrix, codewords: number[]): void {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!reserved[y][x] && i < codewords.length * 8) {
          modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function applyMask(size: number, modules: QrMatrix, reserved: QrMatrix, mask: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (reserved[y][x]) continue;
      let invert: boolean;
      switch (mask) {
        case 0:
          invert = (x + y) % 2 === 0;
          break;
        case 1:
          invert = y % 2 === 0;
          break;
        case 2:
          invert = x % 3 === 0;
          break;
        case 3:
          invert = (x + y) % 3 === 0;
          break;
        case 4:
          invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
          break;
        case 5:
          invert = ((x * y) % 2) + ((x * y) % 3) === 0;
          break;
        case 6:
          invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
          break;
        default:
          invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

/** Lower is better. Follows the four penalty rules of the QR specification. */
function penaltyScore(size: number, modules: QrMatrix): number {
  let penalty = 0;
  const line = (get: (i: number) => boolean) => {
    // Rule 1: runs of five or more same-coloured modules.
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) {
        run++;
      } else {
        if (run >= 5) penalty += run - 2;
        run = 1;
      }
    }
    // Rule 3: patterns that look like a finder (1:1:3:1:1 with four light modules beside it).
    for (let i = 0; i + 6 < size; i++) {
      const finder = get(i) && !get(i + 1) && get(i + 2) && get(i + 3) && get(i + 4) && !get(i + 5) && get(i + 6);
      if (!finder) continue;
      const lightBefore = [1, 2, 3, 4].every((d) => i - d < 0 || !get(i - d));
      const lightAfter = [7, 8, 9, 10].every((d) => i + d >= size || !get(i + d));
      if (lightBefore || lightAfter) penalty += 40;
    }
  };
  for (let y = 0; y < size; y++) line((i) => modules[y][i]);
  for (let x = 0; x < size; x++) line((i) => modules[i][x]);

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) penalty += 3;
    }
  }

  // Rule 4: balance of dark and light.
  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark++;
  penalty += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return penalty;
}

const QUIET_ZONE = 4;

/** SVG path data for the dark modules, in module units, offset by the quiet zone. */
export function qrPath(matrix: QrMatrix): { path: string; viewBoxSize: number } {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`);
    });
  });
  return { path: parts.join(''), viewBoxSize: matrix.length + QUIET_ZONE * 2 };
}
