# Shards & payments: where we stopped (October 7, 2026)

## Done
- **Built:** accounts with passwords, the Postgres database, the 💎 Shard Shop, Stripe Checkout, the webhook, the
  parent email + PIN, the $50 monthly limit, and the `/policy` page (see README → "Accounts and the Shard Shop").
- **The parent's setup:**
  - Step 1: Render Postgres created, `DATABASE_URL` added to ice-cream-tycoon → Environment.
  - Step 2: `STRIPE_SECRET_KEY` (test key, `sk_test_…`) added.
- **Decisions made:**
  - Passwords for everyone.
  - $50 monthly limit; a parent can raise it with the PIN.
  - Packs start at $5.
  - Parent email is needed before the first purchase.

## Next: start here
1. **Step 3:** in Stripe (Test mode), add a webhook endpoint `https://<Render address>/stripe/webhook` with the events
   `checkout.session.completed`, `checkout.session.expired` and `charge.refunded`. Put its signing secret
   (`whsec_…`) in Render as `STRIPE_WEBHOOK_SECRET`. Also add `CONTACT_EMAIL`.
2. **Check the Render logs:** they should show "Saving to the database" and "Shard Shop is on (TEST mode)".
3. **Step 4:** as an admin, set up the parent, buy the $5 pack with the test card 4242 4242 4242 4242, check the
   550 shards arrive, then refund it in Stripe and check they're taken back.
4. **Then:** set `SHARDS=everyone` to open the shop to all players.
5. **Step 5:** live keys and a live webhook, only when the tests pass.

## Good to know while it's paused
- The Shard Shop is visible to admins only.
- Until Step 3 is done, a test purchase won't add shards (the game hasn't been told the payment went through).
  It's fake money in Test mode, so nothing is lost.
