# 🍦 Ice Cream Tycoon

A multiplayer browser game where every player runs their own ice cream stand in a shared park.

## How to play

- You're a character in the park. Walk with the **arrow keys** (or WASD), or **tap/click** where you want to go.
- Your plot has your stand and an **Inventory** chest. **Your stand starts empty** and you get **$20**:
  with no ice cream nobody can buy anything, so first buy a tub at the Supplies Shop and put it on your stand.
- AI customers walk up to your stand, show which flavor they want, and pay when they're served.
- **⏱️ How fast you sell:**
  - 1 ice cream on your stand: **1 scoop sold every 20 seconds**
  - every extra ice cream: **1 second faster**
  - flavors that cost **over $1,000**: **2 seconds faster**; **over $10,000**: **3 seconds faster**
  - the fastest is **1 scoop every second**; only grown ice cream counts; no ice cream = no sales
  - the side panel shows your speed, and the shop and Flavor guide show each flavor's ⏱️ -1s / -2s / -3s.
  - Pressing **Scoop!** (or Space) helps a little: each press takes a quarter second off the wait.
- Walk to the **Supplies Shop** in the middle of the park and tap it to buy tubs of ice cream.
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
| Common    | Vanilla, Chocolate, Banana       | $2              |
| Uncommon  | Strawberry, Blueberry, Mint Chip | $5–$6           |
| Rare      | Cookie Dough, Bubblegum, Cotton Candy | $14–$16         |
| Epic      | Rainbow Sherbet, Mango Tango, Galaxy Swirl | $35–$40         |
| Legendary | Golden Caramel, Lava Swirl, Dragon Fruit | $90–$110        |
| Mythic    | Unicorn Dream, Frozen Aurora, Phoenix Fire | $300–$350       |
| Secret    | ??? (buy it to find out!)        | $1,200          |
| 👑 Admin | Crown Jewel, Storm Cloud, Supernova, Prism Swirl (admins only) | $5,000–$15,000 |
| ♾️ Celestial | Infinity Swirl (admins only, not in the shop; grows in 20 min) | $3,000 |

- Rarer tubs take longer to fill up after you place them: Common 10 s, Uncommon 30 s, Rare 1 min, Epic 3 min,
  Legendary 6 min, Mythic 10 min, Secret 15 min, Celestial 20 min, Cyber 30 min.

- **Stand spaces:** your stand starts with 5 spaces for tubs. When they're all full, an **Extra Space** button appears on top of your stand. Buy it to get 3 more spaces ($300, then $6,000, then $75,000).
- **Avatar Shop:** walk to the blue Avatar Shop at the bottom of the middle plaza and tap it to change your
  character's shirt, pants, skin, hat (cap, top hat, beanie, party hat, cowboy hat, wizard hat, bunny ears,
  ice cream hat) and face. Everyone in the park sees your look, and it's saved with your name.
- **Shop odds:** the really good ice creams are really rare. After each restock the shop has an Epic
  flavor 20% of the time, a Legendary 7%, a Mythic 2% and the Secret flavor only 0.4%.
- **Upgrades:** Tip Jar (+10% money per level).
- ⭐ Sometimes a **lucky golden customer** shows up and pays triple.
- **Mutations:** every 30, 45 or 50 minutes a mutation event hits the whole park for 5 minutes.
  While it's on, each scoop has a 35% chance to mutate and sell for more:

  | Mutation | Money |
  |---|---|
  | 🪙 Gold | x2 |
  | 🌸 Sakura | x4 |
  | 💎 Diamond | x5 |
  | 🪐 Galaxy | x15 |
  | 🌈 Rainbow | x30 |
  | ☄️ Meteor Shower | x40 |
  | ♾️ **Impossible** | **x100** |

  Rarer mutations (bigger money) come up less often. Sakura drops cherry blossoms, Rainbow brings a real
  rainbow over the park, Meteor Shower sends flaming meteors across the sky, and Impossible (the rarest of all)
  makes the whole park glitch with color.
- **Flavor effects:** fancy flavors look special: Phoenix Fire burns with a red glow and flames,
  Infinity Swirl spins with every color and has stars flying in an infinity loop around it,
  Bubblegum blows a bubble that pops, Mango Tango shines like the sun, Lava Swirl drips lava, Frozen Aurora
  shifts green, blue and purple,
  Cosmic Void (the best ice cream) is a tiny black hole with a spinning purple disk, Galaxy Swirl twinkles with stars, Golden Caramel shines,
  Unicorn Dream glows in changing colors, and more.
- **📖 Tutorial:** everyone new goes through a **click-through tour** first: the screen dims, the camera flies
  to each place and spotlights it (your stand, the Supplies Shop, the scoop timer rules, specialty ice creams,
  the chat, the Pet Shop and the Avatar Shop), and you click **Next** 8 times. Then a step-by-step guide with a
  bouncing arrow walks you through it for real: go to the Supplies Shop, buy a tub, hold it, put it on your stand,
  and wait for your first sale. Replay the tour any time with the 📖 Tutorial button.
- **💬 Chat:** the chat box in the top left corner talks to everyone in the park (press Enter to type).
  Mean words get turned into ****. Press — to hide it.
- **🍒 Toppings:** the Supplies Shop has a Toppings square on the side. Hold a topping and tap an ice cream
  on your stand: every scoop of it sells for more (Sprinkles +25% up to Stardust +400%). One topping per ice cream;
  you get it back if you take the ice cream off.
- **🐾 Pet Shop:** at the top of the middle plaza. Open lucky blocks for a random pet. Your pet follows you
  with cool effects and gives you more money from every scoop. Pets move like real animals: they trot to catch up,
  wait and look around when you stop, and sit down after a while. Bunnies hop, pandas and penguins waddle, birds
  and dragons flap in the air, and sea creatures swim through it.
  - Blocks: Wooden, Iron, Gold, Diamond, Rainbow, Rainbow ($15M), Cosmic ($50M), Divine ($150M) and Infinity ($500M).
  - The 🐉 Dragon (+500%) is Secret. Even better are the new pet rarities: **Celestial** (🦖 Lava Rex +700%,
    🦈 Thunder Shark +800%), **Divine** (🕊️ Angel Dove +1,200%, 🐲 Dragon King +1,500%) and **Infinity**
    (🐉 Infinity Dragon +3,000%, the best pet: a 1% chance from the Infinity Block).
  - Press **🐾 My Pets** to see every pet you have (each one gets its own card) and pick which ones follow you.
- **💰 Sell Shop** (bottom of the park, below the Avatar Shop): sell ice cream tubs and toppings from your hotbar or
  Inventory for half of what they cost in the shop, and pets for a set price by rarity (Common $200, Uncommon $800,
  Rare $4,000, Epic $40K, Legendary $400K, Mythic $3M, Secret $15M, Celestial $40M, Divine $100M, Infinity $300M,
  Cyber $600M). Selling a rare pet or one you're wearing asks first. Pets always sell for less than a lucky block
  costs on average, so buying blocks just to sell pets doesn't make money.
  - You can have up to 200 pets. When you're full, the lucky block buttons say **Pets full**; tap **Let go** on a
    pet you don't want in My Pets to make room (it asks first, and the pet is gone for good).
    You can wear up to **3 pets at once**: they follow you in a little line and their money boosts add up.
    **⭐ Equip Best** puts on your 3 best pets. New pets go on by themselves if you're wearing fewer than 3.
- **🎁 Gift & Trade:** pick someone who is playing right now. **Gift** sends them any amount of money
  (type 500, 25k, 3m, 1b or 1t), ice cream, toppings or pets. **Trade** lets you pick what you give and what you
  want back; they get a pop-up and can Accept or say No thanks.
  **Buy** shows the other player's ice cream: pick how many, type the price you'll pay (500, 25k, 1m...), and press
  Offer. They get a pop-up and can Sell or say No thanks; the money only moves if they say yes.
- Up to 12 players share the park. A leaderboard ranks everyone by total money earned.
- Progress is saved by name: come back with the same name to keep your money and flavors.

## ⚡ Cyber Event (admins only online for now)

In the single-file test version (`ice-cream-tycoon.html`) everyone sees the Cyber Event. In the online game only
admins can see it: everyone else never sees the Cyber Block, Cyber pets (except ones an admin is wearing, which
follow them around for everyone to see), Robo Ice Cream, the Robo look, the
Cyber mutation or the Passes (not even on an admin), keeps the old 14 stand spaces, and can't be gifted or traded
Cyber stuff. To show it to everyone online, set `CYBER=1` on the server (an environment variable on Render).

- **Cyber Block** in the Pet Shop ($1B), only during the event week (Oct 5 to Oct 12, 2026). It has these odds:
  Legendary 72.5%, Mythic 15%, Secret (the Tiger) 8%, Mammoth 2%, Dolphin 2%, Cyber Whale 0.5%. It has its own all-cyber pets that no other
  block gives: 🦂 Cyber Scorpion and 🦇 Cyber Bat (Legendary), 🦍 Cyber Gorilla and 🦕 Cyber Dino (Mythic),
  🐅 Cyber Tiger (Secret), 🦣 Cyber Mammoth and 🐬 Cyber Dolphin (Celestial). Each is made of dark armor with glowing
  cyan cracks, with cyber effects that get bigger the rarer it is. It's the only way to get
  the **🐋 Cyber Whale** (Cyber rarity, +5000% money, the best pet): the whale made of dark armor with glowing cyan
  cracks and a ring core, standing on a glowing circuit platform, with energy orbs, sky lightning strikes, a plasma
  spout and beam, and ghost trails. When the event ends the Cyber Block (and the Whale) is gone, but anyone who got
  one keeps it.
- **🤖 Cyber mutation** (x50, the second best). It never starts by itself; only admins can turn it on. It stays for good.
- **Robo Ice Cream** (Cyber rarity): $25,000 a scoop, $50M a tub, a 0.1% chance to be in the shop. Shiny metal with
  glowing robot eyes and a blinking antenna.
- **Robo avatar:** a Robo choice for shirt (chest plate and shoulder pads), pants (metal legs), skin (a square metal
  head with bolts), hat (two antennas) and face (glowing visor).
- Every character has shading, swinging arms, shoes, an ear, hair when there's no hat, and eyes with pupils.
- **⚡ Cyber Pass** (button at the bottom left): sell scoops during the event to unlock 10 prizes in a row, each better
  than the last. The second row has better prizes and needs the Premium Cyber Pass.
- **💎 Game Passes** (bottom left): Starter Bundle ($20,000 + 2 Strawberry + 2 Mint Chip), Premium Cyber Pass,
  Fill All (every empty stand space gets a grown ice cream), Buy an Ice Cream, and Restock the Shop for everyone.
  They cost **💎 shards**: Starter 199, Premium Cyber Pass 499, Fill All 99, Restock 99, one ice cream 49 to 299
  (by rarity). You get 1 shard for every 10 scoops you sell (up to 100 a week), or an admin can gift them with
  **💎 Gift Shards** (test buttons). Admins have unlimited shards. Buying shards with real money isn't built yet:
  see `docs/shards-payments-plan.pdf`.
- **Cyber Pass prizes** that don't fit say so on the button ("🎒 Make room" or "🐾 Pets full"), and error messages
  now show on top of open windows.
- **Up to 30 stand spaces:** the Extra Space button keeps going until 30 and then disappears. With lots of spaces the
  tubs get smaller so they all fit.
- Admins can test the event with `/cyber off`, `/cyber on` and `/cyber auto` (back to the calendar).

## Admin mode

There are two admins: **coolkid** and **James** (any capitals). Each has their own secret code. The first
time on a device, a box asks for that admin's code; once it's right, the device remembers it and just the name is
enough. (The codes aren't written anywhere in the game files, only scrambled versions of them, in `ADMIN_CODES`
in `public/engine.js`.) In admin mode, you start with **$1 trillion**, wear a
gold crown with an [ADMIN] tag, and get an **Admin commands** panel. You can use its buttons or type commands:

| Command | What it does |
|---|---|
| 🏪 **Spawn in Shop** button | Puts the ice cream picked in the Give list (and how many) in the Supplies Shop for everyone until the next restock. Works for 👑 admin ice creams too (they cost 1,000× their scoop price there). `/shop void 3` does the same. |
| 🎁 **Give in Lucky Block** | Type any pet, ice cream or topping (like `dragon`, `void` or `cherry`) and press the button: a lucky block shakes and opens with exactly that, and it goes to you. |
| 🌱 **Grow all now** (test buttons) | Opens a list of everyone playing (you too). Tap **Grow** next to someone and all the ice cream on their stand finishes growing right away, or press **Grow everyone's ice cream**. `/grow` still grows just yours. |
| 🐾 **Pets** button | Shows every pet from most common to rarest. Tap one, press **Spawn**, and it goes in your pets. `/pet dragon 2` works too. Only admins can do this. |
| 🚫 **Ban Players** button | Lists every player (playing now or away). Tap **Ban** twice on someone and they lose everything and start over. Admins can ban other admins too, or themselves (a banned admin starts over with $1T). |
| `/say Hello!` | **All Server Talk**: your message pops up on everyone's screen (also the 📢 button) |
| `/money 5t` | Adds money (use k, m, b or t, like `500k`, `2b`, `5t`) |
| `/give rainbow sherbet 10` | Puts any ice cream in your hotbar, even if the shop is sold out |
| `/spawn supernova` | 👑 Admin-only ice creams (Crown Jewel, Storm Cloud, Supernova, Prism Swirl) are never in the shop; admins get them with `/give` or `/spawn` |
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
file. Progress is saved in that browser. Admins also get test buttons to start any mutation right away,
add $1,000, restock the shop and finish growing your tubs. After changing the game, run `npm run build` to rebuild this file.

## Running it (multiplayer)

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

Then open http://localhost:3000. Friends on the same Wi-Fi can join at `http://<your-computer's-IP>:3000`.
Set the `PORT` environment variable to use a different port.

## Putting it online (play with friends anywhere)

The multiplayer game needs a host that runs Node.js and allows WebSockets, such as
[Render](https://render.com) (free plan available). This repo has a `render.yaml`, so on Render you can choose
**New → Blueprint**, pick this GitHub repo and branch, and Render sets it up (`npm install`, then `npm start`).
You get a link like `https://ice-cream-tycoon.onrender.com` to share with friends.

Good to know about Render's free plan: the game goes to sleep after about 15 minutes with nobody playing (the
next visit takes up to a minute to wake it), and Render wipes the server's files (`data/`) whenever it restarts or
the game is updated.

**Progress still comes back after an update.** Every few seconds the server sends each player a sealed backup of
their progress, which their browser keeps. When someone rejoins with the same name on the same device and the
server has forgotten them, the backup brings everything back (money, ice creams, pets, avatar...). The backup is
sealed with `SAVE_SECRET` (Render makes it from `render.yaml`), so editing it to cheat doesn't work: an edited
backup is thrown away. A paid Render plan with a disk would keep progress on the server too.

Static hosts like GitHub Pages or Netlify can only host the single-player `ice-cream-tycoon.html`, not the
multiplayer game.

**With a database (recommended).** Set `DATABASE_URL` (Render Postgres, the *Internal Database URL*) on the web
service and everything is kept in the database instead: progress, accounts and purchases, safe across updates.
On the first start with an empty database, players come back from their browser backups as they rejoin.

## 🔑 Accounts and 💎 the Shard Shop (online game)

- **Passwords:** every player picks a password the first time they join (at least 4 letters or numbers). A device
  that logged in once is remembered (a "remember me" token, not the password). Forgot it? An admin types
  `/resetpass name` while that player is offline, and they pick a new one next time.
- **Shard Shop** (💎 button, top right): packs of shards for real money through **Stripe Checkout**: $5 → 550,
  $10 → 1,200, $20 → 2,600, $35 → 4,800, $50 → 7,250, $75 → 11,250, $100 → 16,000. Players pay on Stripe's own
  page; the game adds shards only when Stripe's webhook says the payment went through (each payment once), and a
  refund in Stripe takes the shards back.
- **Parents:** before the first purchase a parent enters their email (Stripe sends receipts there) and a parent PIN.
  Each account can spend **$50 a month**; the parent can change that (up to $500) or the email with the PIN.
- **Who sees it:** admins only while testing. Set `SHARDS=everyone` to open it to all players.
- **`/policy`**: the page Stripe needs (contact, what's sold, refunds). Set `CONTACT_EMAIL` to show your email there.

Setup (Render → ice-cream-tycoon → Environment): `DATABASE_URL`, `STRIPE_SECRET_KEY` (`sk_test_…` first),
`STRIPE_WEBHOOK_SECRET` (`whsec_…` from a Stripe webhook pointing at `https://<your address>/stripe/webhook`
with the events `checkout.session.completed`, `checkout.session.expired` and `charge.refunded`), and `CONTACT_EMAIL`.
The full plan is in `docs/shards-payments-plan.pdf`.

## Files

- `server.js`: multiplayer server (connections and saving)
- `store.js`: where progress, accounts and purchases are kept (Postgres with `DATABASE_URL`, otherwise files in `data/`)
- `shop.js`: passwords, parent settings, the Shard Shop and Stripe (checkout and the webhook)
- `public/engine.js`: the game rules (players, customers, sales, the shop, inventories, mutation events), used by the server and the single-file version
- `build.js`: makes `ice-cream-tycoon.html` (with the cover picture packed inside)
- `public/cover.png`: the game's cover picture on the start screen
- `public/gamedata.js`: flavors, rarities, prices, grow times, shop stock, upgrades and mutations (shared by server and browser)
- `public/client.js`: drawing the park and the shop panel in the browser
- `public/index.html`, `public/style.css`: page layout and styles
