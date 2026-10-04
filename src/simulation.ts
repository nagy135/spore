export type Species = "mossling" | "razorback";
export type Biome = "meadow" | "drylands" | "lush";
export interface Genes {
  speed: number;
  size: number;
  defense: number;
  sense: number;
  fertility: number;
  color: string;
  adaptation: "antennae" | "spines" | "plumes";
}
export interface Creature {
  id: number;
  species: Species;
  x: number;
  z: number;
  heading: number;
  age: number;
  energy: number;
  health: number;
  genes: Genes;
  cooldown: number;
  attackCooldown: number;
  targetX: number;
  targetZ: number;
  state: "wandering" | "foraging" | "fleeing" | "hunting" | "resting";
  phase: number;
}
export interface Food {
  id: number;
  x: number;
  z: number;
  available: boolean;
  regrow: number;
}
export interface WorldEvent {
  id: number;
  time: number;
  title: string;
  description: string;
  kind: "birth" | "evolution" | "danger" | "world";
}
export interface HistoryPoint {
  time: number;
  prey: number;
  predators: number;
}
export const DEFAULT_GENES: Genes = {
  speed: 52,
  size: 45,
  defense: 30,
  sense: 58,
  fertility: 55,
  color: "#adcc79",
  adaptation: "antennae",
};
export const PREDATOR_GENES: Genes = {
  speed: 48,
  size: 66,
  defense: 50,
  sense: 70,
  fertility: 32,
  color: "#d88a6e",
  adaptation: "spines",
};
export const geneKeys = [
  "speed",
  "size",
  "defense",
  "sense",
  "fertility",
] as const;
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function mutationCost(before: Genes, after: Genes) {
  const diff = geneKeys.reduce(
    (sum, key) => sum + Math.abs(before[key] - after[key]),
    0,
  );
  return diff === 0 &&
    before.color === after.color &&
    before.adaptation === after.adaptation
    ? 0
    : Math.ceil(
        12 + diff * 0.32 + (before.adaptation === after.adaptation ? 0 : 12),
      );
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
  const shore = clamp((edge - 0.8) / 0.2, 0, 1);
  return elevation * (1 - shore) - shore * 0.14;
}
export function islandRadius(angle: number) {
  return (
    18.7 + Math.sin(angle * 3 + 1.1) * 1.5 + Math.cos(angle * 5 - 0.6) * 0.7
  );
}
export function onLand(x: number, z: number, margin = 1) {
  return Math.hypot(x, z) < islandRadius(Math.atan2(z, x)) - margin;
}
export const speciesName = (s: Species) =>
  s === "mossling" ? "Mossling" : "Razorback";

export class Simulation {
  creatures: Creature[] = [];
  food: Food[] = [];
  events: WorldEvent[] = [];
  history: HistoryPoint[] = [];
  genes: Genes = { ...DEFAULT_GENES };
  predatorGenes: Genes = { ...PREDATOR_GENES };
  time = 0;
  generation = 1;
  dna = 120;
  births = 0;
  preyBirths = 0;
  deaths = 0;
  biome: Biome = "meadow";
  seed: number;
  initialSeed: number;
  private id = 0;
  private lastRecord = -1;
  constructor(seed = 48291, biome: Biome = "meadow") {
    this.seed = seed;
    this.initialSeed = seed;
    this.biome = biome;
    for (let i = 0; i < 24; i++) this.spawn("mossling");
    for (let i = 0; i < 5; i++) this.spawn("razorback");
    for (let i = 0; i < 60; i++) {
      const p = this.randomPoint();
      this.food.push({ id: i, ...p, available: true, regrow: 0 });
    }
    this.event(
      "world",
      "A little life. A lot of possibility.",
      "24 Mosslings and 5 Razorbacks have made this island their home.",
    );
    this.record();
  }
  serialize() {
    return JSON.stringify({ version: 1, state: { ...this } });
  }
  static restore(serialized: string) {
    const saved = JSON.parse(serialized);
    const state = saved?.state;
    if (
      saved?.version !== 1 ||
      !state ||
      !Array.isArray(state.creatures) ||
      state.creatures.length > 100 ||
      !Array.isArray(state.food) ||
      state.food.length > 100 ||
      !Array.isArray(state.history) ||
      state.history.length > 90 ||
      !Array.isArray(state.events) ||
      state.events.length > 40
    )
      throw new Error("Invalid world save");
    for (const key of [
      "seed",
      "initialSeed",
      "time",
      "generation",
      "dna",
      "births",
      "deaths",
      "id",
      "lastRecord",
    ])
      if (!Number.isFinite(state[key]))
        throw new Error("Invalid simulation state");
    const validGenes = (g: Genes) =>
      g &&
      geneKeys.every(
        (key) => Number.isFinite(g[key]) && g[key] >= 0 && g[key] <= 100,
      ) &&
      /^#[0-9a-f]{6}$/i.test(g.color) &&
      ["antennae", "spines", "plumes"].includes(g.adaptation);
    if (
      !validGenes(state.genes) ||
      !validGenes(state.predatorGenes) ||
      !["meadow", "lush", "drylands"].includes(state.biome)
    )
      throw new Error("Invalid genome");
    for (const c of state.creatures)
      if (
        !validGenes(c.genes) ||
        !["mossling", "razorback"].includes(c.species) ||
        ![
          "x",
          "z",
          "heading",
          "age",
          "energy",
          "health",
          "cooldown",
          "attackCooldown",
          "targetX",
          "targetZ",
          "phase",
          "id",
        ].every((key) => Number.isFinite(c[key]))
      )
        throw new Error("Invalid creature");
    const sim = new Simulation(state.initialSeed, state.biome);
    Object.assign(sim, state);
    return sim;
  }
  random() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }
  randomPoint() {
    const angle = this.random() * Math.PI * 2,
      r = Math.sqrt(this.random()) * (islandRadius(angle) - 2);
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  }
  get population() {
    return this.creatures.filter((c) => c.species === "mossling").length;
  }
  get predators() {
    return this.creatures.filter((c) => c.species === "razorback").length;
  }
  get availableFood() {
    return this.food.filter((f) => f.available).length;
  }
  get averageHealth() {
    const c = this.creatures.filter((c) => c.species === "mossling");
    return c.length ? c.reduce((s, v) => s + v.health, 0) / c.length : 0;
  }
  get biodiversity() {
    return Math.min(
      3.9,
      1 +
        (this.population > 0 ? 0.45 : 0) +
        (this.predators > 0 ? 0.4 : 0) +
        this.availableFood / 100 +
        this.generation * 0.035,
    );
  }
  spawn(species: Species, parent?: Creature) {
    let p = parent
      ? {
          x: parent.x + (this.random() - 0.5) * 1.2,
          z: parent.z + (this.random() - 0.5) * 1.2,
        }
      : this.randomPoint();
    if (!onLand(p.x, p.z, 1)) p = this.randomPoint();
    const target = this.randomPoint();
    const creature: Creature = {
      id: ++this.id,
      species,
      ...p,
      heading: this.random() * Math.PI * 2,
      age: parent ? 0 : 18 + this.random() * 35,
      energy: parent ? 75 : 70 + this.random() * 30,
      health: 100,
      genes: { ...(species === "mossling" ? this.genes : this.predatorGenes) },
      cooldown: parent ? 23 : 8 + this.random() * 25,
      attackCooldown: 0,
      targetX: target.x,
      targetZ: target.z,
      state: "wandering",
      phase: this.random() * 10,
    };
    this.creatures.push(creature);
    return creature;
  }
  event(kind: WorldEvent["kind"], title: string, description: string) {
    this.events.unshift({
      id: ++this.id,
      time: this.time,
      title,
      description,
      kind,
    });
    this.events = this.events.slice(0, 40);
  }
  record() {
    this.history.push({
      time: this.time,
      prey: this.population,
      predators: this.predators,
    });
    if (this.history.length > 90) this.history.shift();
  }
  mutate(genes: Genes) {
    const cost = mutationCost(this.genes, genes);
    if (cost === 0 || cost > this.dna) return false;
    this.dna -= cost;
    this.genes = { ...genes };
    for (const c of this.creatures)
      if (c.species === "mossling") c.genes = { ...genes };
    this.event(
      "evolution",
      "A new chapter in your DNA.",
      `Your Mosslings now have ${genes.adaptation}. New traits are active across the population.`,
    );
    return true;
  }
  rescue() {
    if (this.population > 0) return;
    for (let i = 0; i < 12; i++) this.spawn("mossling");
    this.dna = Math.max(this.dna, 60);
    this.event(
      "birth",
      "Life gets another chance.",
      "12 Mosslings have been reintroduced with your latest genome.",
    );
  }
  setBiome(biome: Biome) {
    this.biome = biome;
    this.event(
      "world",
      "The environment is changing.",
      biome === "drylands"
        ? "A dry season slows plant growth. Adapt to scarce food."
        : biome === "lush"
          ? "Rain brings abundant food, and new opportunities to grow."
          : "Mild weather returns to the meadow.",
    );
  }
  update(delta: number) {
    const dt = Math.min(delta, 0.12);
    this.time += dt;
    const nextGeneration = Math.floor(this.time / 45) + 1;
    if (nextGeneration > this.generation) {
      this.generation = nextGeneration;
      this.dna += 35;
      this.predatorGenes = {
        ...this.predatorGenes,
        speed: clamp(this.predatorGenes.speed + 3, 0, 95),
        sense: clamp(this.predatorGenes.sense + 2, 0, 95),
        size: clamp(
          this.predatorGenes.size + (this.genes.defense > 55 ? 3 : 1),
          0,
          90,
        ),
      };
      for (const c of this.creatures)
        if (c.species === "razorback") c.genes = { ...this.predatorGenes };
      this.event(
        "evolution",
        `Generation ${this.generation}: predators adapt.`,
        `Razorbacks evolved faster legs and sharper senses. You gained 35 DNA.`,
      );
    }
    const foodRegrow =
      this.biome === "drylands" ? 48 : this.biome === "lush" ? 16 : 29;
    for (const f of this.food)
      if (!f.available) {
        f.regrow -= dt;
        if (f.regrow <= 0) f.available = true;
      }
    const born: Creature[] = [];
    const dead = new Set<number>();
    const prey = this.creatures.filter((c) => c.species === "mossling"),
      predators = this.creatures.filter((c) => c.species === "razorback");
    for (const c of this.creatures) {
      c.age += dt;
      c.cooldown -= dt;
      c.attackCooldown -= dt;
      c.energy -=
        dt *
        (c.species === "mossling"
          ? 0.38 +
            c.genes.size * 0.004 +
            c.genes.speed * 0.002 +
            (c.genes.adaptation === "spines" ? 0.07 : 0)
          : 0.4);
      let tx = c.targetX,
        tz = c.targetZ;
      let moving = 1;
      const vision =
        3 + c.genes.sense * 0.1 + (c.genes.adaptation === "antennae" ? 1.8 : 0);
      if (c.species === "mossling") {
        let danger: Creature | undefined;
        let dangerDist = Infinity;
        for (const p of predators) {
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          if (d < dangerDist) {
            danger = p;
            dangerDist = d;
          }
        }
        if (danger && dangerDist < vision) {
          c.state = "fleeing";
          tx = c.x + (c.x - danger.x) * 4;
          tz = c.z + (c.z - danger.z) * 4;
          moving = 1.32;
        } else if (c.energy < 90) {
          let nearest: Food | undefined;
          let dist = Infinity;
          for (const f of this.food) {
            if (!f.available) continue;
            const d = Math.hypot(f.x - c.x, f.z - c.z);
            if (d < dist) {
              dist = d;
              nearest = f;
            }
          }
          if (nearest && dist < vision * 1.9) {
            tx = nearest.x;
            tz = nearest.z;
            c.state = "foraging";
            if (dist < 0.85) {
              nearest.available = false;
              nearest.regrow = foodRegrow;
              c.energy = Math.min(100, c.energy + 34);
              c.health = Math.min(100, c.health + 10);
              this.dna = Math.min(999, this.dna + 0.32);
              moving = 0.15;
            }
          } else c.state = "wandering";
        } else {
          c.state = "wandering";
          moving = 0.65;
        }
        if (
          c.cooldown <= 0 &&
          c.energy > 72 &&
          c.age > 15 &&
          prey.length + born.filter((b) => b.species === "mossling").length < 64
        ) {
          const chance =
            dt *
            (0.015 + c.genes.fertility * 0.0008) *
            (this.biome === "drylands" ? 0.55 : 1);
          if (this.random() < chance) {
            born.push(c);
            c.energy -= 24;
            c.cooldown = 23;
          }
        }
      } else {
        let nearest: Creature | undefined;
        let dist = Infinity;
        for (const p of prey) {
          if (dead.has(p.id)) continue;
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          if (d < dist) {
            dist = d;
            nearest = p;
          }
        }
        if (nearest && dist < vision + 2) {
          tx = nearest.x;
          tz = nearest.z;
          c.state = "hunting";
          moving = 1.12;
          if (dist < 1.02 && c.attackCooldown <= 0) {
            const armor =
              1 +
              nearest.genes.defense * 0.028 +
              (nearest.genes.adaptation === "spines" ? 0.55 : 0);
            nearest.health -= 28 / armor;
            nearest.energy -= 2;
            c.attackCooldown = 0.75;
            if (nearest.genes.adaptation === "spines") c.energy -= 2;
            if (nearest.health <= 0) {
              dead.add(nearest.id);
              c.energy = Math.min(100, c.energy + 60);
              this.deaths++;
              if (this.deaths % 3 === 1)
                this.event(
                  "danger",
                  "The food chain turns.",
                  `A Razorback caught a Mossling. Speed, perception and armor help your species survive.`,
                );
            }
          }
        } else c.state = "wandering";
        if (
          c.cooldown <= 0 &&
          c.energy > 85 &&
          predators.length +
            born.filter((b) => b.species === "razorback").length <
            14 &&
          prey.length > 8
        ) {
          if (this.random() < dt * 0.025) {
            born.push(c);
            c.energy -= 30;
            c.cooldown = 35;
          }
        }
      }
      if (c.energy < 5) c.health -= dt * 4;
      if (c.energy > 60) c.health = Math.min(100, c.health + dt * 0.6);
      if (c.age > 210) c.health -= dt * 0.65;
      if (c.health <= 0 && !dead.has(c.id)) {
        dead.add(c.id);
        this.deaths++;
      }
      if (Math.hypot(tx - c.x, tz - c.z) < 0.9 || !onLand(tx, tz, 0.8)) {
        const p = this.randomPoint();
        c.targetX = p.x;
        c.targetZ = p.z;
        if (c.state !== "hunting" && c.state !== "foraging") {
          tx = p.x;
          tz = p.z;
        }
      }
      const angle = Math.atan2(tx - c.x, tz - c.z);
      let difference =
        ((angle - c.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      c.heading += difference * Math.min(1, dt * 5);
      const speed =
        (0.5 + c.genes.speed * 0.024) *
        (c.species === "razorback" ? 1.03 : 1) *
        (1 - c.genes.defense * 0.0022) *
        moving *
        (c.age < 15 ? 0.7 : 1) *
        (c.energy < 18 ? 0.65 : 1);
      const nx = c.x + Math.sin(c.heading) * speed * dt,
        nz = c.z + Math.cos(c.heading) * speed * dt;
      if (onLand(nx, nz, 0.8)) {
        c.x = nx;
        c.z = nz;
      } else {
        c.heading += Math.PI * 0.45;
        const p = this.randomPoint();
        c.targetX = p.x;
        c.targetZ = p.z;
      }
    }
    this.creatures = this.creatures.filter((c) => !dead.has(c.id));
    for (const parent of born)
      if (!dead.has(parent.id)) {
        this.spawn(parent.species, parent);
        this.births++;
        if (parent.species === "mossling") this.preyBirths++;
        if (parent.species === "mossling" && this.births % 4 === 1)
          this.event(
            "birth",
            "A new Mossling is born.",
            `Your population is growing. The new arrival inherits your current traits.`,
          );
      }
    if (prey.length > 0 && this.population === 0)
      this.event(
        "danger",
        "Your species has gone extinct.",
        "Reintroduce your Mosslings or try a new genome. Every experiment teaches you something.",
      );
    if (Math.floor(this.time / 2) > this.lastRecord) {
      this.lastRecord = Math.floor(this.time / 2);
      this.record();
    }
  }
}
