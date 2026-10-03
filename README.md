# 🍦 Ice Cream Tycoon

A multiplayer browser game where every player runs their own ice cream stand in a shared park.

## How to play

- You're a character in the park. Walk with the **arrow keys** (or WASD), or **tap/click** where you want to go.
- Your plot has your stand and an **Inventory** chest. Everyone starts with **Chocolate** and **Vanilla** on their stand.
- AI customers walk up to your stand, show which flavor they want, and pay when they're served.
  Press **Scoop!** (or the Space bar) to serve them faster.
- Walk to the **Ice Cream Shop** at the top of the park and tap it to buy tubs of ice cream.
  The shop's stock changes every **3 minutes**, and rare flavors aren't always in stock.
- Tubs you buy go into your **hotbar**: the 10 see-through grey slots at the bottom (keys 1–0 to pick one).
  When you hold a tub, **dashed outlines** show the empty spaces on your stand. Tap one to place it.
- A placed tub has to **grow** before customers can buy it. Common ones grow fastest; rarer ones grow slower:
  Common 10s, Uncommon 30s, Rare 1 min, Epic 2 min, Legendary 4 min, Mythic 7 min, Secret 10 min,
  Godly 15 min, Heavenly 20 min, Impossible 30 min. Godly, Heavenly and Impossible tubs are very rarely in the shop.
  Once it's grown it stays on your stand. Tap a tub (with nothing in your hand) to take it back off.
- Tap the **Inventory** button on your plot to store tubs: tap a tub in the chest to move it to your hotbar,
  or tap one in your hotbar to put it in the chest.
- Rarer flavors sell for more:

| Rarity    | Flavors                          | Price per scoop |
|-----------|----------------------------------|-----------------|
| Common    | Vanilla, Chocolate               | $2              |
| Uncommon  | Strawberry, Mint Chip            | $5–$6           |
| Rare      | Cookie Dough, Cotton Candy       | $14–$16         |
| Epic      | Rainbow Sherbet, Galaxy Swirl    | $35–$40         |
| Legendary | Golden Caramel, Dragon Fruit     | $90–$110        |
| Mythic    | Unicorn Dream, Phoenix Fire      | $300–$350       |
| Secret    | ??? (buy it to find out!)        | $1,200          |
| **Godly** | Divine Gold, Zeus Thunder        | $5,000–$6,500   |
| **Heavenly** | Angel Cloud, Starlight Halo   | $18,000–$25,000 |
| **Impossible** | Infinity Swirl, Glitch Pop  | $80,000–$120,000 |

- **Stand spaces:** your stand starts with 5 spaces for tubs. When they're all full, an **Extra Space** button appears on top of your stand. Buy it to get 3 more spaces ($300, $6,000, $75,000, $1M, then $20M, up to 20 spaces).
- **Upgrades:** Bigger Sign (more customers), Tip Jar (+10% money per level).
- ⭐ Sometimes a **lucky golden customer** shows up and pays triple.
- **Mutations:** every 30, 45 or 50 minutes a mutation event hits the whole park for 5 minutes.
  While it's on, each scoop has a 35% chance to mutate and sell for more:

  | Mutation | Money | Mutation | Money |
  |---|---|---|---|
  | 🪙 Gold | x2 | 🌑 Shadow | x12 |
  | 🍬 Candy | x3 | 🪐 Galaxy | x15 |
  | ❄️ Frozen | x3 | ☯️ Yin Yang | x20 |
  | 💎 Diamond | x5 | 🌕 Blood Moon | x25 |
  | ⚡ Thunder | x6 | 🌈 Rainbow | x30 |
  | 🌋 Molten | x8 | ⚜️ **Godly** | **x50** |
  | 🌌 Aurora | x10 | 😇 **Heavenly** | **x75** |
  | | | ♾️ **Impossible** | **x100** |

  Rarer mutations (bigger money) come up less often. Rainbow brings a real rainbow over the park,
  Godly fills the sky with golden light rays, Heavenly brings clouds, light beams and falling feathers,
  and Impossible (the rarest of all) makes the whole park glitch with color.
- **Flavor effects:** fancy flavors look special: Phoenix Fire burns with a red glow and flames,
  Cosmic Void has a dark purple aura, Galaxy Swirl twinkles with stars, Golden Caramel shines,
  Unicorn Dream glows in changing colors, Divine Gold shines with spinning light rays, Angel Cloud
  has flapping wings, Zeus Thunder crackles with lightning, Infinity Swirl spins through every color, and more.
- Up to 12 players share the park. A leaderboard ranks everyone by total money earned.
- Progress is saved by name: come back with the same name to keep your money and flavors.

## Admin mode

Join with the name **coolkid** (any capitals) to get admin mode: you start with **$1 trillion**, wear a
gold crown with an [ADMIN] tag, and get an **Admin commands** panel. You can use its buttons or type commands:

| Command | What it does |
|---|---|
| `/money 5t` | Adds money (use k, m, b or t, like `500k`, `2b`, `5t`) |
| `/give rainbow sherbet 10` | Puts any ice cream in your hotbar, even if the shop is sold out |
| `/mutation impossible` | Starts that mutation for everyone right now (`/mutation` alone picks one at random) |
| `/mutation end` | Ends the current mutation |
| `/restock` | Gives the shop new stock right now |
| `/grow` | Finishes growing every tub on your stand |

Admin names are listed in `ADMIN_NAMES` in `public/engine.js`. In multiplayer, anyone who types an
admin name gets admin, so keep it a secret or change it.

## Quick test (no install)

Open `ice-cream-tycoon.html` in any web browser. It's a single-player version of the game in one
file. Progress is saved in that browser, and it has test buttons to start any mutation right away,
add $1,000, restock the shop and finish growing your tubs. After changing the game, run `npm run build` to rebuild this file.

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
- `public/engine.js`: the game rules (players, customers, sales, the shop, inventories, mutation events), used by the server and the single-file version
- `build.js`: makes `ice-cream-tycoon.html`
- `public/gamedata.js`: flavors, rarities, prices, grow times, shop stock, upgrades and mutations (shared by server and browser)
- `public/client.js`: drawing the park and the shop panel in the browser
- `public/index.html`, `public/style.css`: page layout and styles
