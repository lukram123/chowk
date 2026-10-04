import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeQr, qrPath } from './qr';

// These two matrices were checked by decoding them with an independent QR reader
// (OpenCV) when the encoder was written. They guard against accidental changes.
const VERIFIED: Record<string, string[]> = {
  A: [
    '111111101101001111111',
    '100000100110001000001',
    '101110100111101011101',
    '101110101110001011101',
    '101110101110101011101',
    '100000101111001000001',
    '111111101010101111111',
    '000000001011100000000',
    '100010111001011111001',
    '001010001001100101011',
    '111101100011001111100',
    '111000010100011010110',
    '111011111000111000111',
    '000000001010111000111',
    '111111101100110000010',
    '100000100111100101010',
    '101110101111001111111',
    '101110100101100101011',
    '101110100001001111100',
    '100000100100011010100',
    '111111101010111000101',
  ],
  'https://chowk.example/s/MS2041': [
    '11111110001101001001001111111',
    '10000010010011110000101000001',
    '10111010011011001101101011101',
    '10111010010111110000001011101',
    '10111010001101101110101011101',
    '10000010111001100111001000001',
    '11111110101010101010101111111',
    '00000000011110100110100000000',
    '10010110111100010100010100000',
    '10011000000110110000111001001',
    '00011011010010001001101101110',
    '11111000110100110011001100110',
    '11010110000110001001101101011',
    '10011000111010010111110000000',
    '01101110011110011010010001111',
    '00010101110001101111011011010',
    '01011011010101111111010000010',
    '01010100111100010010011101001',
    '10110111101001000110011010011',
    '00101100001101011100101110011',
    '10001010101010101011111110100',
    '00000000101101011111100010111',
    '11111110000001110010101010010',
    '10000010101101001000100011111',
    '10111010010110111110111110010',
    '10111010110111111111001111101',
    '10111010000100100100010011101',
    '10000010011010110101111010010',
    '11111110110101001110100011010',
  ],
};

const rows = (text: string) => encodeQr(text).map((row) => row.map((dark) => (dark ? '1' : '0')).join(''));

describe('encodeQr', () => {
  it('reproduces the verified codes', () => {
    for (const [text, expected] of Object.entries(VERIFIED)) assert.deepEqual(rows(text), expected);
  });

  it('picks the smallest version that fits', () => {
    const size = (bytes: number) => encodeQr('x'.repeat(bytes)).length;
    assert.deepEqual([size(14), size(15), size(26), size(27), size(42), size(43)], [21, 25, 25, 29, 29, 33]);
    assert.deepEqual([size(62), size(63), size(84), size(85), size(106)], [33, 37, 37, 41, 41]);
  });

  it('refuses text that is too long', () => {
    assert.throws(() => encodeQr('x'.repeat(107)), /too long/);
  });

  it('counts bytes, not characters', () => {
    assert.equal(encodeQr('₹'.repeat(4)).length, 21); // 12 bytes
    assert.equal(encodeQr('₹'.repeat(5)).length, 25); // 15 bytes
  });
});

describe('qrPath', () => {
  it('draws one square per dark module inside a 4-module quiet zone', () => {
    const matrix = encodeQr('A');
    const { path, viewBoxSize } = qrPath(matrix);
    assert.equal(viewBoxSize, 21 + 8);
    const dark = matrix.flat().filter(Boolean).length;
    assert.equal(path.split('M').length - 1, dark);
    assert.ok(path.startsWith('M4 4h1v1h-1z')); // top-left finder corner
  });
});
