export const TERRAIN_SEGMENTS = 128;
export const TERRAIN_RINGS = 22;

export function islandRadius(angle: number) {
  return (
    18.7 + Math.sin(angle * 3 + 1.1) * 1.5 + Math.cos(angle * 5 - 0.6) * 0.7
  );
}
export function onLand(x: number, z: number, margin = 1) {
  return Math.hypot(x, z) < islandRadius(Math.atan2(z, x)) - margin;
}
export function terrainHeight(x: number, z: number) {
  const elevation =
    0.42 +
    Math.sin(x * 0.17 + z * 0.07) * 0.6 +
    Math.cos(z * 0.23 - x * 0.08) * 0.42 +
    Math.sin(x * 0.48) * Math.cos(z * 0.39) * 0.12 +
    2.1 * Math.exp(-((x + 9) ** 2 + (z + 6) ** 2) / 30) +
    1.7 * Math.exp(-((x - 9) ** 2 + (z - 7) ** 2) / 22);
  const edge = Math.hypot(x, z) / islandRadius(Math.atan2(z, x));
  const shore = Math.max(0, Math.min(1, (edge - 0.8) / 0.2));
  return elevation * (1 - shore) - shore * 0.14;
}

export interface Obstacle {
  id: string;
  kind: "tree" | "rock";
  x: number;
  z: number;
  radius: number;
}
interface Rock {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  color: string;
}

// Bound the horizontal projection of a rotated ellipsoid. This contains the
// entire rendered rock, including boulders whose tall axes lean sideways.
export function rockRadius(rock: Rock) {
  const a = Math.cos(rock.rx),
    b = Math.sin(rock.rx);
  const c = Math.cos(rock.ry),
    d = Math.sin(rock.ry);
  const e = Math.cos(rock.rz),
    f = Math.sin(rock.rz);
  const x = [c * e * rock.sx, -c * f * rock.sy, d * rock.sz];
  const z = [
    (b * f - a * d * e) * rock.sx,
    (b * e + a * d * f) * rock.sy,
    a * c * rock.sz,
  ];
  const xx = x.reduce((sum, v) => sum + v * v, 0);
  const zz = z.reduce((sum, v) => sum + v * v, 0);
  const xz = x.reduce((sum, v, i) => sum + v * z[i], 0);
  return Math.sqrt((xx + zz + Math.hypot(xx - zz, 2 * xz)) / 2);
}

/** One seeded layout supplies both rendered scenery and physical obstacles. */
export function createHabitat(initialSeed: number) {
  let seed = (Math.abs(initialSeed) % 2147483646) + 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  // Keep existing worlds' scenery in its original positions: terrain colors
  // consume one random value per triangle before the scenery is generated.
  for (let i = 0; i < TERRAIN_SEGMENTS * (TERRAIN_RINGS * 2 - 1); i++) rand();
  const shoreRocks: Rock[] = [];
  const outcrop: Rock[] = [];
  const pondRocks: Rock[] = [];
  const trees: {
    x: number;
    z: number;
    kind: number;
    scale: number;
    shade: boolean;
    rotation: number;
  }[] = [];
  const ferns: { x: number; z: number; scale: number }[] = [];
  const obstacles: Obstacle[] = [];
  const addRock = (list: Rock[], rock: Rock) => {
    obstacles.push({
      id: `rock-${obstacles.length}`,
      kind: "rock",
      x: rock.x,
      z: rock.z,
      radius: rockRadius(rock),
    });
    list.push(rock);
  };
  for (let i = 0; i < 150; i++) {
    const angle = (i / 150) * Math.PI * 2;
    const radius = islandRadius(angle) - 0.2 + rand() * 0.65;
    addRock(shoreRocks, {
      x: Math.cos(angle) * radius,
      y: -0.31,
      z: Math.sin(angle) * radius,
      color: i % 3 ? "#b0b99a" : "#d5cfaf",
      sx: 0.55 + rand() * 0.5,
      sy: 0.5 + rand() * 0.3,
      sz: 0.48 + rand() * 0.5,
      rx: rand(),
      ry: rand() * 3,
      rz: rand(),
    });
  }
  for (let i = 0; i < 58; i++) {
    const angle = rand() * Math.PI * 2,
      radius = 10 + rand() * 6;
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius;
    if (x > 4 && z > 4 && rand() < 0.55) continue;
    const kind = rand(),
      scale = 0.55 + rand() * 0.48;
    const shade = kind < 0.56 ? rand() < 0.5 : false;
    trees.push({ x, z, kind, scale, shade, rotation: rand() * 6 });
    obstacles.push({
      id: `tree-${i}`,
      kind: "tree",
      x,
      z,
      radius: 0.22 * scale,
    });
  }
  for (let i = 0; i < 75; i++) {
    const angle = rand() * Math.PI * 2,
      radius = Math.sqrt(rand()) * 16;
    ferns.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      scale: 0.5 + rand() * 0.75,
    });
  }
  for (let i = 0; i < 13; i++) {
    const x = -8 + (rand() - 0.5) * 5,
      z = -7 + (rand() - 0.5) * 4;
    addRock(outcrop, {
      x,
      z,
      y: terrainHeight(x, z) + 0.3,
      color: rand() > 0.4 ? "#9da997" : "#c0c2aa",
      sx: 0.7 + rand() * 1.7,
      sy: 0.6 + rand() * 2.2,
      sz: 0.7 + rand() * 1.1,
      rx: rand() * 0.5,
      ry: rand() * 4,
      rz: rand() * 0.4,
    });
  }
  for (let i = 0; i < 20; i++) {
    const angle = rand() * Math.PI * 2;
    const x = 4 + Math.cos(angle) * 2.5 * 1.3,
      z = -4 + Math.sin(angle) * 2.5 * 0.73;
    addRock(pondRocks, {
      x,
      z,
      y: terrainHeight(x, z),
      color: "#c2c5ab",
      sx: 0.2 + rand() * 0.2,
      sy: 0.16,
      sz: 0.2 + rand() * 0.3,
      rx: 0,
      ry: angle,
      rz: 0,
    });
  }
  return { shoreRocks, trees, ferns, outcrop, pondRocks, obstacles };
}
