# 🍦 Ice Cream Tycoon

A multiplayer browser game where every player runs their own ice cream stand in a shared park.

## How to play

- Everyone starts with **Chocolate** and **Vanilla**.
- AI customers walk up to your stand, show which flavor they want, and pay when they're served.
- Customers get served on their own, but you can press **Scoop!** (or the Space bar, or tap your stand) to serve them faster.
- Spend your money to unlock new flavors. Rarer flavors sell for more:

| Rarity    | Flavors                          | Price per scoop |
|-----------|----------------------------------|-----------------|
| Common    | Vanilla, Chocolate               | $2              |
| Uncommon  | Strawberry, Mint Chip            | $5–$6           |
| Rare      | Cookie Dough, Cotton Candy       | $14–$16         |
| Epic      | Rainbow Sherbet, Galaxy Swirl    | $35–$40         |
| Legendary | Golden Caramel, Dragon Fruit     | $90–$110        |
| Mythic    | Unicorn Dream, Phoenix Fire      | $300–$350       |
| Secret    | ??? (unlock it to find out!)     | $1,200          |

- **Flavor spaces:** your stand starts with 5 spaces for flavors (Vanilla and Chocolate use 2). When they're all full, an **Extra Space** button appears on top of your stand. Buy it to get 3 more spaces ($300, then $6,000, then $75,000).
- **Upgrades:** Bigger Sign (more customers), Tip Jar (+10% money per level).
- ⭐ Sometimes a **lucky golden customer** shows up and pays triple.
- **Mutations:** every 30, 45 or 50 minutes a mutation event hits the whole park for 5 minutes.
  While it's on, each scoop has a 35% chance to mutate and sell for more:

  | Mutation | Money | Mutation | Money |
  |---|---|---|---|
  | 🪙 Gold | x2 | 🌌 Aurora | x10 |
  | 🍬 Candy | x3 | 🪐 Galaxy | x15 |
  | ❄️ Frozen | x3 | ☯️ Yin Yang | x20 |
  | 💎 Diamond | x5 | 🌕 Blood Moon | x25 |
  | ⚡ Thunder | x6 | 🌈 **Rainbow** | **x30** |

  Rarer mutations (bigger money) come up less often. **Rainbow** is the best and rarest: a real
  rainbow arches over the park during a light sun shower, and scoops come out rainbow-striped.
- Up to 12 players share the park. A leaderboard ranks everyone by total money earned.
- Progress is saved by name: come back with the same name to keep your money and flavors.

## Quick test (no install)

Open `ice-cream-tycoon.html` in any web browser. It's a single-player version of the game in one
file. Progress is saved in that browser, and it has test buttons to start any mutation right away
and to add $1,000. After changing the game, run `npm run build` to rebuild this file.

## Running it (multiplayer)

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

Then open http://localhost:3000. Friends on the same Wi-Fi can join at `http://<your-computer's-IP>:3000`.
Set the `PORT` environment variable to use a different port. Start with `TEST_MODE=1 npm start` to show the test buttons.

## Files

- `server.js`: multiplayer server (connections and saving)
- `public/engine.js`: the game rules (customers, sales, mutation events), used by the server and the single-file version
- `build.js`: makes `ice-cream-tycoon.html`
- `public/gamedata.js`: flavors, rarities, prices, upgrades and mutations (shared by server and browser)
- `public/client.js`: drawing the park and the shop panel in the browser
- `public/index.html`, `public/style.css`: page layout and styles
