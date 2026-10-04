import assert from "node:assert/strict";
import test from "node:test";
import { Simulation, DEFAULT_GENES, mutationCost, onLand } from "./simulation";

function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / 0.1); i++) sim.update(0.1);
}

test("a seeded ecosystem grows, hunts, and keeps creatures on the island", () => {
  const a = new Simulation(48291),
    b = new Simulation(48291);
  advance(a, 180);
  advance(b, 180);
  assert.equal(a.population, b.population);
  assert.deepEqual(a.creatures, b.creatures);
  assert.ok(a.births > 15, "animals reproduce");
  assert.ok(a.deaths > 0, "predators hunt");
  assert.ok(
    a.population > 0,
    "the initial genome survives long enough to experiment",
  );
  assert.ok(
    a.creatures.every((c) => onLand(c.x, c.z, 0)),
    "all creatures stay on land",
  );
});
test("a mutation costs DNA, affects living creatures and is inherited by offspring", () => {
  const sim = new Simulation();
  const genes = {
    ...DEFAULT_GENES,
    speed: 80,
    defense: 65,
    adaptation: "spines" as const,
  };
  const cost = mutationCost(sim.genes, genes);
  assert.equal(sim.mutate(genes), true);
  assert.equal(sim.dna, 120 - cost);
  assert.ok(
    sim.creatures
      .filter((c) => c.species === "mossling")
      .every((c) => c.genes.speed === 80 && c.genes.adaptation === "spines"),
  );
  const child = sim.spawn("mossling", sim.creatures[0]);
  assert.deepEqual(child.genes, genes);
  assert.equal(child.age, 0);
});
test("unaffordable and unchanged mutations do not spend DNA or change the genome", () => {
  const sim = new Simulation();
  sim.dna = 2;
  assert.equal(sim.mutate({ ...DEFAULT_GENES, speed: 95 }), false);
  assert.deepEqual(sim.genes, DEFAULT_GENES);
  assert.equal(sim.dna, 2);
  assert.equal(sim.mutate({ ...sim.genes }), false);
  assert.equal(sim.dna, 2);
});
test("each generation rewards the player and evolves living predators", () => {
  const sim = new Simulation();
  sim.food = [];
  const initialSpeed = sim.predatorGenes.speed;
  const initialSense = sim.predatorGenes.sense;
  advance(sim, 46);
  assert.equal(sim.generation, 2);
  assert.equal(sim.predatorGenes.speed, initialSpeed + 3);
  assert.equal(sim.predatorGenes.sense, initialSense + 2);
  assert.ok(sim.dna >= 155);
  assert.ok(
    sim.creatures
      .filter((c) => c.species === "razorback")
      .every((c) => c.genes.speed === initialSpeed + 3),
  );
  assert.ok(sim.events.some((e) => e.kind === "evolution"));
});
test("armor reduces damage in an otherwise identical encounter", () => {
  function attack(defense: number) {
    const sim = new Simulation(32);
    sim.creatures = sim.creatures.slice(0, 1);
    const prey = sim.creatures[0];
    prey.x = 0;
    prey.z = 0;
    prey.genes = { ...prey.genes, defense };
    const predator = sim.spawn("razorback");
    predator.x = 0;
    predator.z = 0.5;
    sim.update(0.1);
    return prey.health;
  }
  assert.ok(attack(90) > attack(10), "more armor protects prey during a bite");
});
test("extinction recovery restores a population with the latest genome", () => {
  const sim = new Simulation();
  sim.mutate({ ...DEFAULT_GENES, color: "#8dbbbc", sense: 80 });
  sim.creatures = sim.creatures.filter((c) => c.species === "razorback");
  sim.rescue();
  assert.equal(sim.population, 12);
  assert.ok(
    sim.creatures
      .filter((c) => c.species === "mossling")
      .every((c) => c.genes.color === "#8dbbbc"),
  );
});
test("food grows back and different climates affect its regrowth", () => {
  const dry = new Simulation(123, "drylands"),
    lush = new Simulation(123, "lush");
  for (const sim of [dry, lush]) {
    sim.creatures = [sim.creatures[0]];
    const c = sim.creatures[0];
    c.x = 0;
    c.z = 0;
    c.energy = 60;
    sim.food = [{ id: 0, x: 0, z: 0, available: true, regrow: 0 }];
    sim.update(0.1);
  }
  assert.equal(dry.food[0].available, false);
  assert.equal(lush.food[0].available, false);
  assert.ok(dry.food[0].regrow > lush.food[0].regrow);
  dry.creatures = [];
  lush.creatures = [];
  advance(dry, 20);
  advance(lush, 20);
  assert.equal(dry.food[0].available, false);
  assert.equal(lush.food[0].available, true);
});
test("a saved world resumes with the same creatures, genome, and random sequence", () => {
  const original = new Simulation(12345);
  advance(original, 75);
  original.mutate({ ...DEFAULT_GENES, defense: 65 });
  const restored = Simulation.restore(original.serialize());
  assert.equal(restored.serialize(), original.serialize());
  advance(original, 20);
  advance(restored, 20);
  assert.deepEqual(original.creatures, restored.creatures);
  assert.equal(original.dna, restored.dna);
});
test("unsupported or corrupt saves are rejected", () => {
  assert.throws(() => Simulation.restore("{bad json}"));
  assert.throws(() => Simulation.restore('{"version":99,"state":{}}'));
});
