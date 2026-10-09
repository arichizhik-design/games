# 👾 Monster Mash

A blocky 3D boss-fighting adventure that runs in the browser. You start in a village with a pet turtle and a
baseball bat. Four monsters each guard a magic egg somewhere on the island. Beat them for treasure, eggs, riddles
and faster pets.

**To play:** open `monster-mash.html` (in the repo root) in a browser. Everything is inside that one file.

## The adventure

1. **Tutorial.** Talk to Guide Gus, hit his training dummy, and ride your pet (Pebble the Turtle: slow, but still a
   bit faster than you run). Gus then gives you a **radar**. The red dot shows where to go and counts down the miles.
2. **Forest: the Giant Deer.** When the radar says 0.0 miles there's a giant rabbit hole. Inside, vines hang from
   the roof, and a huge dirt room holds an egg and a sleeping deer. Pick up the egg and the deer wakes up.
3. **Desert: the Sand Scorpion.** The deer's scroll has a riddle that points to the sand cave. The big room has an
   egg and no boss. Pick it up, walk a few steps, and a cutscene plays: rumbling, you turn around, and a giant
   scorpion bursts out of the sand. It also drops **scuba gear**.
4. **Ocean: the King Squid.** Swim out to the dive spot and hold Shift to dive. Keep going down for 30 seconds and a
   cutscene plays: two whales swim in from the left and right, pass each other and leave, and a coral cave appears.
   Inside, the King Squid sleeps on a golden throne. Take the egg, walk a few steps, and he wakes up.
5. **Crystal Caves: the Crystal Spider (final boss of World 1).** An egg sits in the sunlight under a hole in the
   roof. Take it back toward the tunnel: a screech, you turn around, the walls shake, and the spider comes down from
   the hole on a web. Beat it and a **rocket ship** lands in the village (World 2 isn't built yet).

Each boss has more health and hits harder than the one before. Red circles and stripes on the floor show where an
attack will land, and floating hearts appear during fights so you can heal. You can fight any boss again for
another egg; it gets 30% tougher each time.

## Planets, coins and your house

- The cave openings are far apart, each at a different edge of the map, well away from the village.
- **Coins:** every boss win gives coins (more on later planets; a rematch gives 60%). Spend them at **Sue's
  Decoration Shop** at the end of the village street. What you buy shows up inside your house: a flower pot, rug,
  lamp, bookshelf, couch, painting, fish tank, TV, trophy case, rainbow bed, gold pet statue and a disco ball.
- **Rocket ship:** beating the final spider puts a rocket in your hotbar. Hold it outside and click or tap: you ride it
  up in a cutscene, then pick a planet. Each planet unlocks after beating the one before it.
- **World 2, the Frost Planet:** snowy pine woods, an ice field, a frozen sea and the Ice Caves. Bosses: Frost Stag,
  Glacier Scorpion, Ice Kraken, Snow Queen Spider (3x health, 1.8x damage).
- **World 3, the Lava Planet:** ash woods, a red desert, a boiling sea and the Fire Caves. Bosses: Fire Stag, Magma
  Scorpion, Lava Kraken, Inferno Spider (7x health, 3x damage).
- Each planet has its own boss progress, places in new spots, and better chests (Frost Blade, Ice Hammer, Ice Cannon,
  Blizzard Ray, Lava Sword, Magma Axe, Lava Launcher, Sun Beam; Frost and Lava armor) and faster pets.
- Crystal spider pets are big (about half the size of the boss) but still small enough to ride.

## Rewards

After every boss you get a **treasure chest**: a row of prizes spins under a red dashed line, and you win the one it
stops on. Each chest is better than the last (the chances are shown under the spinner):

| Chest | Prizes |
|---|---|
| Wooden (Deer) | Stone Sword 40%, Leather Armor 40%, Iron Sword 12%, Iron Armor 8% |
| Sandstone (Scorpion) | Iron Sword 30%, Iron Armor 30%, Stinger Spear 20%, Golden Armor 12%, Golden Sword 8% |
| Golden (Squid) | Golden Sword 25%, Golden Armor 25%, Trident 22%, Diamond Armor 13%, Diamond Sword 10%, **Blaster (gun) 5%** |
| Crystal (Spider) | Always a gun: Blaster 55%, Laser Gun 28%, Plasma Cannon 13%, Rainbow Ray 4% |

Take each **egg home** to the incubator in your house to hatch it. Better bosses drop better eggs:

| Egg | Pets (speed) |
|---|---|
| Forest | Forest Bunny 50% (9), Red Fox 35% (10.5), Baby Deer 15% (12) |
| Desert | Camel 45% (11), Fennec Fox 35% (12.5), Baby Scorpion 20% (14) |
| Ocean | Dolphin 45% (13), Shark 35% (15), Baby Squid 20% (16) |
| Crystal | Always a Crystal Spider, with mutations: normal 80% (18), Gold 13% (20), Diamond 6% (22), Rainbow 1% (25) |

You run at speed 5.5. A new pet that's faster than your current one starts following you right away; press P to
switch pets.

## Controls

| | Keyboard and mouse | Touch screen |
|---|---|---|
| Move | W A S D | joystick |
| Look | mouse (click the game first), or ← → | drag the screen |
| Swing / shoot | click (or F) | tap the screen, or Swing |
| Jump / swim up | Space | Jump |
| Dive (with scuba gear) | Shift (or C) | Down |
| Talk, pick up, open | E | E |
| Ride / hop off | R | Ride |
| Hotbar | 1-9 or mouse wheel | tap a slot |
| Pets | P | Pets button |

## Names, saves and admin

You type your name on the title screen. Each name gets its own save on that device (pets, gear, eggs, which
bosses you've beaten), and the game remembers the last name used. Saves stay on the device and browser they were
made in.

The name **Ari** gets admin powers: the best weapons (Sun Beam and Magma Axe), Lava Armor, a Rainbow Inferno Spider, the rocket ship and every planet unlocked.
Anyone who types Ari gets them. The name is set in `game.js` (`ADMIN_NAME`).

## Files

- `index.html`, `style.css`: the page, HUD, radar, chest spinner and scroll
- `data.js`: weapons, armor, pets, eggs, chests, bosses, planets, shop decorations and riddles (change chances and stats here)
- `textures.js`: block and item pictures, drawn in code
- `world.js`: each planet's map (village, woods, desert, sea, crystal mountain), the four boss caves and the deep ocean
- `models.js`: the player, pets, bosses, Guide Gus, chests, eggs, whales, the rocket and other models
- `game.js`: levels, travel between them, movement, swimming, pets, bullets, particles and sounds
- `boss.js`: the boss fights, cutscene triggers and rewards
- `ui.js`: quests, radar, dialogue, chest spinner, scrolls, hatching, cutscenes, controls and the main loop
- `three.min.js`: the 3D library (three.js r149)
- `build.js`: run `node monster-mash/build.js` after changing the game to rebuild `monster-mash.html`

While working on it you can also open `monster-mash/index.html` directly.
