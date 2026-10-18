// In-browser cryptographic utilities using standard Web Crypto API

/**
 * Computes the SHA-256 hash of an ArrayBuffer or File in the browser.
 * Returns formatted 0x-prefixed 64-character hex string (matching Ethereum bytes32).
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<string>} e.g. "0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"
 */
export async function computeSha256Hex(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexString = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `0x${hexString}`;
}

/**
 * Reads a File object and returns both the ArrayBuffer and computed SHA-256.
 * @param {File} file
 * @returns {Promise<{ buffer: ArrayBuffer, hash: string, size: number, name: string }>}
 */
export async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const hash = await computeSha256Hex(buffer);
  return {
    buffer,
    hash,
    size: file.size,
    name: file.name,
  };
}

/**
 * Shortens a blockchain hash or Ethereum address for clean UI display.
 * @param {string} str
 * @param {number} [startChars=6]
 * @param {number} [endChars=4]
 */
export function formatAddressOrHash(str, startChars = 6, endChars = 4) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= startChars + endChars + 2) return str;
  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`;
}
