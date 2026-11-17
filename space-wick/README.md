# 🚀 Space Wick

A multiplayer space shooter. You're a spaceship. Everyone, and every dummy, has **200 health**.

## How to play

- **Phone:** put your left thumb down in the bottom-left and drag to fly. **Tap anywhere else to shoot** at that spot (hold to keep shooting).
- **Computer:** WASD or arrow keys to fly, click (or hold) to shoot where the mouse is.

### The lobby (safe)
- You start here. Nobody can hurt you in the lobby.
- **ENTER WICK** portal: fly into it to go to the battlefield.
- **PLANE SHOP**: fly to it and tap **👀 LOOK** to see the planes. Better planes cost more.
- **UPGRADE SHOP**: fly to it and tap **👀 LOOK** to upgrade Damage, Fire Rate and Engine speed.
- 3 practice dummies. They give **no money**.

### The Wick (the battlefield)
- Other pilots are here. Shoot them down for **$50**.
- 16 dummies that don't move. Each one you destroy gives **$10** (they come back after 4 seconds).
- When you arrive you get a 3-second shield (it turns off as soon as you shoot).
- If you get shot down you go back to the lobby after 3 seconds and keep all your money.
- If you stay out of the fight for 5 seconds, your health slowly fills back up.
- Fly into **BACK TO LOBBY** at the bottom of the map to go back and shop.
- 🤖 AI pilots fly in the Wick so it's never empty. They make room when more real players join.

### Planes

| Plane   | Price   | Speed | Damage | Guns |
|---------|---------|-------|--------|------|
| Rookie  | free    | 260   | 10     | 1    |
| Scout   | $150    | 320   | 12     | 1    |
| Viper   | $400    | 330   | 17     | 1    |
| Falcon  | $1,000  | 345   | 14     | 2    |
| Phantom | $2,500  | 385   | 20     | 2    |
| Titan   | $6,000  | 340   | 28     | 2    |
| Nova    | $15,000 | 420   | 30     | 3    |

### Upgrades (10 levels each, work on every plane you own)
- 💥 **Damage**: +10% bullet damage per level (starts at $60)
- 🔫 **Fire Rate**: shoot 8% faster per level (starts at $70)
- 🚀 **Engine**: +6% speed per level (starts at $50)

Each level costs 1.7× more than the one before.

Your money, planes and upgrades are saved under your pilot name.

## Running it

**Multiplayer** (everyone who opens the address plays together):

```bash
cd space-wick
npm install
npm start
```

Then open http://localhost:3000. Friends on the same Wi-Fi can open `http://<your computer's IP>:3000`.
To put it on the internet, deploy this folder to any Node host (for example Render: a Web Service with
**Root Directory** `space-wick`, build command `npm install`, start command `npm start`).

**Solo** (no server): `npm run build` makes `space-wick.html`, one file you can open in any browser.
It has the AI pilots and dummies, and saves progress on that device.

## Files
- `public/engine.js`: the game rules (health, bullets, money, shops, AI pilots). Runs on the server and in solo mode.
- `public/client.js`: drawing, controls and shop screens.
- `server.js`: the multiplayer server (saves progress in `data/players.json`).
