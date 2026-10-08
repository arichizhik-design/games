# 🐢 Pet Quest: The Crystal Caves

A blocky 3D adventure that runs in the browser. You walk around a big block world with a pet that follows you,
learn the basics from Guide Gus, then travel to the Crystal Caves to fight the Crystal Golem for its egg.

**To play:** open `pet-quest.html` (in the repo root) in a browser. Everything is inside that one file.

## How it plays

- **Tutorial:** walk around, talk to Guide Gus, hit the training dummy with your baseball bat, ride your pet,
  then Gus sends you to the Crystal Caves. The quest box (top left) and the arrow (top middle) show where to go.
- **Your pet** follows you everywhere. You start with **Pebble the Turtle**: slow, but still a bit faster than you
  can run (7 vs 5.5). Press **R** next to it to ride, **R** again to hop off.
- **The Crystal Caves** are at the end of the gravel path, under the purple light. Walk through the dark doorway,
  follow the tunnel, and you reach a big crystal room where the **Crystal Golem is sleeping next to a glowing egg**.
- **Pick up the egg** (E) and the Golem wakes up, the egg falls out of your hands, and crystals seal the tunnel.
  You have to fight it.
- **The fight:** red circles on the floor show where an attack will land.
  - Slam: a big red circle in front of it. Run out, or jump right as it lands.
  - Crystal shards: it throws crystals at you. Keep moving sideways.
  - Charge: a red stripe shows where it will run. Step aside; if it hits the wall it gets dizzy and takes extra damage.
  - Crystal rain (when it's below half health): small red circles, then crystals fall from the ceiling.
- **Win** and you get the egg, and a **treasure chest** appears. Pick a **better weapon** or **armor**.
- **Hatch the egg:** pick it in the hotbar (2) and click. Pets and their speed:

| Pet | Rarity | Chance | Speed |
|---|---|---|---|
| Pebble the Turtle | Starter | | 7 |
| Crystal Bunny | Common | 45% | 9 |
| Gem Fox | Uncommon | 28% | 10.5 |
| Shadow Wolf | Rare | 17% | 12 |
| Amethyst Dragon | Epic | 8% | 14 |
| Rainbow Dragon | Legendary | 2% | 17 |

- **Rematch:** leave the cave and come back. The Golem is back, one level stronger, with a new egg.
- Weapons: Baseball Bat (5) → Stone Sword (8) → Crystal Sword (12) → Golem Hammer (18) → Rainbow Blade (25).
  Armor: Leather (blocks 25%) → Iron (40%) → Crystal (55%) → Golem (70%).
- Progress (pets, gear, Golem level) is saved in the browser.

## Controls

| | Keyboard and mouse | Touch screen |
|---|---|---|
| Move | W A S D | joystick |
| Look | mouse (click the game first), or ← → | drag the screen |
| Swing / hatch | click (or F) | Swing |
| Jump | Space | Jump |
| Talk, pick up, open | E | E |
| Ride / hop off | R | Ride |
| Hotbar | 1-9 or mouse wheel | tap a slot |
| Pets | P | Pets button |

## Files

- `index.html`, `style.css`: the page and the on-screen HUD
- `textures.js`: block and item pictures, drawn in code
- `world.js`: the block worlds (the overworld with the village and the cave mountain, and the Crystal Caves)
- `models.js`: the player, pets, Golem, Guide Gus, dummy, chest and egg, plus the weapon, armor and pet lists
- `game.js`: movement, physics, the pet following and riding, levels, particles and sounds
- `boss.js`: the Crystal Golem fight
- `ui.js`: tutorial quests, dialogue, hotbar, chest, hatching, pets menu, controls and the main loop
- `three.min.js`: the 3D library (three.js r149)
- `build.js`: run `node pet-quest/build.js` after changing the game to rebuild `pet-quest.html`

While working on it you can also open `pet-quest/index.html` directly.
