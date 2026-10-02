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
- Up to 12 players share the park. A leaderboard ranks everyone by total money earned.
- Progress is saved by name: come back with the same name to keep your money and flavors.

## Running it

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

Then open http://localhost:3000. Friends on the same Wi-Fi can join at `http://<your-computer's-IP>:3000`.
Set the `PORT` environment variable to use a different port.

## Files

- `server.js`: game server (customers, sales, saving) and web server
- `public/gamedata.js`: flavors, rarities, prices and upgrades (shared by server and browser)
- `public/client.js`: drawing the park and the shop panel in the browser
- `public/index.html`, `public/style.css`: page layout and styles
