import type { Genes } from "./simulation";

export const TRAIT_KEYS = [
  "speed",
  "size",
  "defense",
  "sense",
  "fertility",
] as const;
export const TIER_RANGE = 100;
export function tierUnlockCost(tier: number) {
  return Math.ceil(200 * tier ** 1.6);
}
export function validGenes(genes: Genes, ceiling = Number.MAX_SAFE_INTEGER) {
  return Boolean(
    genes &&
    TRAIT_KEYS.every(
      (key) =>
        Number.isFinite(genes[key]) && genes[key] >= 0 && genes[key] <= ceiling,
    ) &&
    /^#[0-9a-f]{6}$/i.test(genes.color) &&
    ["antennae", "spines", "plumes"].includes(genes.adaptation),
  );
}

/** Integrate the marginal price, so splitting an upgrade cannot make it cheap. */
export function mutationCost(before: Genes, after: Genes) {
  if (!validGenes(after)) return Infinity;
  const changed =
    TRAIT_KEYS.some((key) => before[key] !== after[key]) ||
    before.color !== after.color ||
    before.adaptation !== after.adaptation;
  if (!changed) return 0;
  let cost = 12 + (before.adaptation === after.adaptation ? 0 : 12);
  for (const key of TRAIT_KEYS) {
    const from = before[key],
      to = after[key];
    if (to > from)
      cost +=
        (to - from) * (1 + (to * to + to * from + from * from) / (3 * 90 ** 2));
  }
  return Math.ceil(cost);
}

/** Preserve existing genomes; advanced levels give gradual biological gains.
 * Bodies grow toward a natural size limit, keeping the island navigable. */
export function expressGene(key: (typeof TRAIT_KEYS)[number], level: number) {
  if (level <= 100) return level;
  return key === "size"
    ? 100 + 5 * (1 - Math.exp(-(level - 100) / 300))
    : 100 + 60 * Math.log1p((level - 100) / 100);
}
export function bodyResilience(level: number) {
  return 0.6 * Math.log1p(Math.max(0, level - 100) / 100);
}
export function expressedGenes(genes: Genes): Genes {
  const result = { ...genes };
  for (const key of TRAIT_KEYS) result[key] = expressGene(key, genes[key]);
  return result;
}
