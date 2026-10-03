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
  Common 10s, Uncommon 30s, Rare 1 min, Epic 2 min, Legendary 4 min, Mythic 7 min, Secret 10 min.
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

- **Stand spaces:** your stand starts with 5 spaces for tubs. When they're all full, an **Extra Space** button appears on top of your stand. Buy it to get 3 more spaces ($300, then $6,000, then $75,000).
- **Avatar Shop:** walk to the blue Avatar Shop next to the Ice Cream Shop and tap it to change your
  character's shirt, pants, skin, hat (cap, top hat, beanie, party hat, cowboy hat, wizard hat, bunny ears,
  ice cream hat) and face. Everyone in the park sees your look, and it's saved with your name.
- **Shop odds:** the really good ice creams are really rare. After each restock the shop has an Epic
  flavor 20% of the time, a Legendary 7%, a Mythic 2% and the Secret flavor only 0.4%.
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
  Cosmic Void (the best ice cream) is a tiny black hole with a spinning purple disk, Galaxy Swirl twinkles with stars, Golden Caramel shines,
  Unicorn Dream glows in changing colors, and more.
- Up to 12 players share the park. A leaderboard ranks everyone by total money earned.
- Progress is saved by name: come back with the same name to keep your money and flavors.

## Admin mode

There are two admins: **coolkid** and **James** (any capitals). Each has their own secret code. The first
time on a device, a box asks for that admin's code; once it's right, the device remembers it and just the name is
enough. (The codes aren't written anywhere in the game files, only scrambled versions of them, in `ADMIN_CODES`
in `public/engine.js`.) In admin mode, you start with **$1 trillion**, wear a
gold crown with an [ADMIN] tag, and get an **Admin commands** panel. You can use its buttons or type commands:

| Command | What it does |
|---|---|
| `/money 5t` | Adds money (use k, m, b or t, like `500k`, `2b`, `5t`) |
| `/give rainbow sherbet 10` | Puts any ice cream in your hotbar, even if the shop is sold out |
| `/spawn void 3` | Puts any ice cream straight onto your stand, already grown |
| `/mutation rainbow godly blood moon` | Turns on one or more mutations at once, on top of any already going (`/mutation` alone starts a random one) |
| `/mutation end` | Ends all mutations |
| `/restock` | Gives the shop new stock right now |
| `/grow` | Finishes growing every tub on your stand |

The admin panel also has mutation buttons: tap as many as you like, then **Turn on**. When several
mutations are going, each one has its own chance on every scoop, and they stack (a scoop can be Rainbow
*and* Godly for x1,500).

**Admin is locked to each admin's device.** Without the right code, an admin name doesn't work at all. In
multiplayer, the first device that joins with an admin name (and its code) becomes that admin's device, and
anyone who types that name on a different device is told the name is taken, even if they know the code. To move admin
to a new device, delete the `adminDevice` line for that name in `data/players.json` while the server is
stopped. (The single-file test version runs only on the device that opens it, so there the secret code is what keeps admin yours.)



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
