// Deterministic public ids for fixtures.
//
// Tests want ids that are valid (`<prefix>_<32 hex>`) so validation paths
// are exercised, and stable across runs so assertions can name them. A seed
// label mixes down to 32 hex characters with a dependency-free hash.

function hex32(seed: string): string {
  let h1 = (0x9e3779b9 ^ seed.length) >>> 0;
  let h2 = 0x85ebca6b;
  let h3 = 0xc2b2ae35;
  let h4 = 0x27d4eb2f;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
    h3 = Math.imul(h3 ^ c, 374761393);
    h4 = Math.imul(h4 ^ c, 3266489917);
  }
  const part = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return part(h1) + part(h2) + part(h3) + part(h4);
}

/** A stable, valid public id of the given kind derived from a seed label. */
export function testId(prefix: string, seed: string): string {
  return `${prefix}_${hex32(seed)}`;
}
