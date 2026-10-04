# Verdant

A browser-only 3D evolution sandbox built with Three.js, React, and TypeScript. No backend or external art assets are required: the island, plants, water, and creatures are generated in code.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. For a production build, run `npm run build`; `npm run preview` serves that build. Requires Node.js 20.19+ or 22.12+.

## Play

Your Mosslings live on an island with evolving Razorback predators. Watch them search for berries, flee danger, hunt, mature, and reproduce. Open the creature lab to change movement, size, armor, senses, fertility, skin pigment, and antennae/spines/plumes. The live 3D preview shows your changes before you apply them. Updated genes apply to all Mosslings and their offspring.

- Drag the island to orbit, scroll to zoom, and click a creature to inspect it.
- **Space** pauses or resumes; **M** opens the creature lab; **R** resets the camera.
- Switch between 1×, 2× and 4× time. Each 45 world seconds begins a generation, rewards 35 DNA, and evolves predator speed, senses, and size.
- Feeding also earns DNA. Mutations spend DNA; speed costs energy, size costs food, and armor slows movement while reducing damage. Antennae extend perception, spines add defense, and plumes and pigment are cosmetic.
- Try a lush rainforest or a dry season to change food regrowth. Use **New world** to restart with a different simulation and scenery seed.
- The population graph and field notes show the consequences. Extinct Mosslings can be reintroduced using your latest genome.

The entire world saves automatically in your browser's local storage and resumes on reload. Worlds are local to that browser; no account or network service is used. The simulation runs while the page is open and does not advance while it is closed.

## Checks

```sh
npm test
npm run build
```

The simulation tests cover seeded behavior, reproduction and hunting, inheritance, mutation costs, armor, predator evolution, food regrowth, extinction recovery, and save restoration.

## Structure

- `src/simulation.ts` — deterministic agent simulation and save state.
- `src/World.tsx` — Three.js island, instanced scenery, camera and creature interaction.
- `src/creatures.ts` — procedural, animated creatures derived from genes.
- `src/App.tsx` — game controls, mutation editor, species inspector, graphs, and field notes.
- `src/style.css` — responsive interface.
