// HUD, radar, quests, dialogue, treasure chest spinner, scrolls, hatching, the rocket, cutscenes, controls and the main loop.
'use strict';

// ---------- toast ----------
let toastTimer = null;
function showToast(text, secs = 2.5) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, secs * 1000);
}

// ---------- hearts and armour ----------
const heartImgs = { 1: ICONS.heart(1).toDataURL(), 0.5: ICONS.heart(0.5).toDataURL(), 0: ICONS.heart(0).toDataURL() };
function updateHearts() {
  const el = $('hearts');
  if (!el.children.length) for (let i = 0; i < 10; i++) { const im = document.createElement('img'); im.width = 18; im.height = 18; im.alt = ''; el.appendChild(im); }
  for (let i = 0; i < 10; i++) {
    const v = player.hp - i * 2;
    el.children[i].src = heartImgs[v >= 2 ? 1 : v >= 1 ? 0.5 : 0];
  }
  const a = ARMORS[save.armor];
  $('armorIcon').innerHTML = '';
  if (save.armor > 0) {
    const im = document.createElement('img');
    im.src = ICONS.armor(hex(a.color)).toDataURL();
    im.width = 18; im.height = 18; im.alt = '';
    const t = document.createElement('span');
    t.textContent = `${a.name} · blocks ${Math.round(a.block * 100)}%`;
    $('armorIcon').append(im, t);
  }
}

// ---------- hotbar: your weapons, then your eggs ----------
const iconUrls = {};
function iconUrl(key, make) { if (!iconUrls[key]) iconUrls[key] = make().toDataURL(); return iconUrls[key]; }
function weaponIconUrl(id) { return iconUrl('w:' + id, () => weaponIcon(id)); }
function eggIconUrl(type) { return iconUrl('e:' + type, () => ICONS.egg(type)); }
function armorIconUrl(tier) { return iconUrl('a:' + tier, () => ICONS.armor(hex(ARMORS[tier].color))); }
function hotbarItems() {
  const items = WEAPON_ORDER.filter(id => save.weapons.includes(id)).map(id => ({ kind: 'weapon', id, name: WEAPONS[id].name, icon: weaponIconUrl(id) }));
  for (const type of Object.keys(EGGS)) if (save.eggs[type] > 0) items.push({ kind: 'egg', type, name: `${EGGS[type].name} (hatch it at home)`, icon: eggIconUrl(type), count: save.eggs[type] });
  while (items.length < 9) items.push(null);
  return items.slice(0, 9);
}
function selectedItem() {
  const it = hotbarItems()[G.slot];
  if (!it) return null;
  if (it.kind === 'weapon') { save.weapon = it.id; return 'weapon'; }
  return 'egg:' + it.type;
}
let itemNameTimer = null;
function updateHotbar() {
  const el = $('hotbar');
  if (!el.children.length) {
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.addEventListener('pointerdown', e => { e.stopPropagation(); selectSlot(i); });
      el.appendChild(s);
    }
  }
  const items = hotbarItems();
  if (!items[G.slot]) G.slot = Math.max(0, items.findIndex(it => it && it.kind === 'weapon' && it.id === save.weapon));
  items.forEach((it, i) => {
    const s = el.children[i];
    s.classList.toggle('sel', i === G.slot);
    s.innerHTML = `<span class="key">${i + 1}</span>` + (it ? `<img alt="" src="${it.icon}">` + (it.count > 1 ? `<span class="count">${it.count}</span>` : '') : '');
  });
}
function selectSlot(i) {
  G.slot = (i + 9) % 9;
  updateHotbar();
  const it = hotbarItems()[G.slot];
  if (it && it.kind === 'weapon') save.weapon = it.id;
  $('itemName').textContent = it ? it.name + (it.kind === 'weapon' ? ` · ${WEAPONS[it.id].dmg} damage` : '') : '';
  clearTimeout(itemNameTimer);
  itemNameTimer = setTimeout(() => { $('itemName').textContent = ''; }, 2200);
}

// ---------- quests and the radar ----------
function setStep(n) {
  if (n <= save.step) return;
  save.step = n;
  writeSave();
  if (n > 0) sfx('step');
}
function doorTarget(id, label) { const d = DOORS[id]; return { world: 'overworld', x: d.trigger.x, z: d.trigger.z, label }; }
function questInfo() {
  const where = G.world ? G.world.name : 'overworld';
  const t = touch.active;
  switch (save.step) {
    case 0: return { text: t ? 'Walk with the joystick. Drag the screen to look around.' : 'Walk around with W A S D. Move the mouse to look around (click the game first).' };
    case 1: return { text: 'Talk to Guide Gus, the villager with the big nose. Walk up to him and press E.', target: { world: 'overworld', x: OVER.guide.x, z: OVER.guide.z, label: 'Guide Gus' } };
    case 2: return { text: `${t ? 'Tap Swing' : 'Click'} to hit the training dummy with your baseball bat. Hits: ${save.dummyHits}/3`, target: { world: 'overworld', x: OVER.dummy.x, z: OVER.dummy.z, label: 'Dummy' } };
    case 3: return { text: t ? 'Ride Pebble! Walk next to your turtle and tap Ride.' : 'Ride Pebble! Walk next to your turtle and press R. Press R again to hop off.' };
    case 4: return { text: 'Nice riding! Go back to Guide Gus. He has something for you.', target: { world: 'overworld', x: OVER.guide.x, z: OVER.guide.z, label: 'Guide Gus' } };
  }
  const A = arenaHere();
  if (A) {
    const name = A.cfg.name;
    if (fightArena === A) return { text: `Defeat the ${name}! Get out of the red circles. Grab hearts to heal.` };
    if (A.defeated) {
      if (A.eggState === 'pedestal') return { text: 'You won! Pick up the egg (E).', target: { world: where, x: A.eggHome.x, z: A.eggHome.z, label: 'Egg' } };
      if (A.chestState === 'ready') return { text: 'Open the treasure chest (E) and spin for a prize!', target: { world: where, x: CAVE.chest.x, z: CAVE.chest.z, label: 'Chest' } };
      if (A.scubaState === 'ready') return { text: 'The Scorpion dropped SCUBA GEAR! Pick it up (E).', target: { world: where, x: A.scuba.position.x, z: A.scuba.position.z, label: 'Scuba gear' } };
      if (A.scrollState === 'ready') return { text: 'There\'s a scroll! Pick it up and read the riddle (E).', target: { world: where, x: CAVE.scroll.x, z: CAVE.scroll.z, label: 'Scroll' } };
      return { text: 'All done here! Head back outside and take your egg home.', target: { world: where, x: CAVE.start.x, z: 1, label: 'Way out' } };
    }
    if (player.eggHeld) return { text: A.bossId === 'spider' ? 'Quick, carry the egg back into the tunnel!' : 'You have the egg! Walk back toward the way out...' };
    if (player.pos.z < CAVE.roomDoorZ) return { text: `Follow the tunnel deep into the cave${A.bossId === 'rabbit' ? '' : ''}.`, target: { world: where, x: CAVE.start.x, z: CAVE.roomDoorZ + 4, label: 'Big room' } };
    const hint = { deer: 'A giant deer is sleeping next to an egg. Sneak up and pick up the egg (E).', scorpion: 'An egg, and no boss anywhere... Pick up the egg (E).', squid: 'The King Squid is asleep on his golden throne. Pick up the egg (E).', spider: 'An egg, sitting in the sunlight. Pick it up (E).' }[A.bossId];
    return { text: hint, target: { world: where, x: A.eggHome.x, z: A.eggHome.z, label: 'Egg' } };
  }
  if (where === 'deep') {
    if (!G.whalesDone) return { text: `Keep sinking down! ${t ? 'Hold Down' : 'Hold Shift'} to dive faster. Depth: ${Math.max(0, Math.round((DEEP.top - player.pos.y) * 1.5))} m · ${Math.max(0, Math.ceil(DEEP.diveSeconds - G.diveT))} s` };
    const c = G.levels.deep.coralCave.position;
    return { text: 'A coral cave appeared! Swim down into it.', target: { world: 'deep', x: c.x, z: c.z, label: 'Coral cave' } };
  }
  if (eggCount() > 0) return { text: 'Take your egg home! Walk into your house and use the Egg Incubator (E).', target: { world: 'overworld', x: OVER.incubator.x, z: OVER.incubator.z, label: 'Home' } };
  const next = BOSS_ORDER[save.progress];
  if (next === 'deer') return { text: 'Follow the radar into the forest. Find the giant rabbit hole!', target: doorTarget('rabbit', 'Forest') };
  if (next === 'scorpion') return { text: 'The scroll\'s riddle points to the DESERT. Find the sand cave! (Scroll button to read it again)', target: doorTarget('sand', 'Desert') };
  if (next === 'squid') return { text: `Go to the ocean dive spot. Swim out and ${t ? 'hold Down' : 'hold Shift'} to dive with your scuba gear!`, target: { world: 'overworld', x: OVER.diveSpot.x, z: OVER.diveSpot.z, label: 'Ocean' } };
  if (next === 'spider') return { text: 'The riddle points to the CRYSTAL CAVES under the purple light. The final boss waits there!', target: doorTarget('crystal', 'Crystal Caves') };
  return { text: 'You beat World 1! Climb into the rocket ship in the village (E). Or replay any boss for more eggs.', target: { world: 'overworld', x: OVER.rocketPad.x, z: OVER.rocketPad.z, label: 'Rocket' } };
}

let lastQuest = '';
const radarCtx = $('radarCanvas').getContext('2d');
function updateQuestHud() {
  const q = questInfo();
  if (q.text !== lastQuest) { $('questText').textContent = q.text; lastQuest = q.text; }
  const r = $('radar');
  if (!save.radar) { r.hidden = true; return; }
  r.hidden = false;
  const ctx = radarCtx, S = 112, C = S / 2;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0c2a1a'; ctx.beginPath(); ctx.arc(C, C, C - 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(110,255,150,0.35)'; ctx.lineWidth = 1;
  [0.33, 0.66, 0.97].forEach(f => { ctx.beginPath(); ctx.arc(C, C, (C - 3) * f, 0, TAU); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(C, 4); ctx.lineTo(C, S - 4); ctx.moveTo(4, C); ctx.lineTo(S - 4, C); ctx.stroke();
  const sweep = (G.time * 2) % TAU;
  const grad = ctx.createConicGradient ? ctx.createConicGradient(sweep - 0.9, C, C) : null;
  if (grad) {
    grad.addColorStop(0, 'rgba(110,255,150,0)'); grad.addColorStop(0.14, 'rgba(110,255,150,0.35)'); grad.addColorStop(0.15, 'rgba(110,255,150,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(C, C, C - 3, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(C, C - 6); ctx.lineTo(C - 4, C + 4); ctx.lineTo(C + 4, C + 4); ctx.fill();
  let label = '';
  if (q.target && q.target.world === G.world.name) {
    const ax = player.mounted ? pet : player;
    const dx = q.target.x - ax.pos.x, dz = q.target.z - ax.pos.z, dist = Math.hypot(dx, dz);
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    const rr = Math.min(1, Math.sqrt(dist / 220)) * (C - 10);
    const bx = C + Math.sin(ang) * rr, by = C - Math.cos(ang) * rr;
    ctx.fillStyle = '#ff4a4a';
    ctx.beginPath(); ctx.arc(bx, by, 5 + Math.sin(G.time * 6) * 1.5, 0, TAU); ctx.fill();
    const miles = dist / BLOCKS_PER_MILE;
    label = `${q.target.label} · ${dist < 3 ? '0.0' : miles.toFixed(1)} mi`;
  } else label = q.target ? q.target.label : 'No signal';
  $('radarText').textContent = label;
}

// ---------- dialogue ----------
let dialogState = null;
function openDialog(name, lines, onDone) {
  dialogState = { name, lines, i: 0, onDone };
  $('dialogName').textContent = name;
  $('dialogText').textContent = lines[0];
  $('dialog').hidden = false;
  sfx('thud');
}
function advanceDialog() {
  if (!dialogState) return;
  dialogState.i++;
  if (dialogState.i >= dialogState.lines.length) {
    const done = dialogState.onDone;
    dialogState = null;
    $('dialog').hidden = true;
    if (done) done();
    return;
  }
  $('dialogText').textContent = dialogState.lines[dialogState.i];
  sfx('thud');
}
$('dialog').addEventListener('pointerdown', e => { e.stopPropagation(); advanceDialog(); });

function talkToGus() {
  if (save.step <= 1) {
    openDialog('Guide Gus', [
      'Hi there! Welcome to MONSTER MASH! I\'m Gus.',
      'See that little turtle following you? That\'s Pebble, your very first pet!',
      'Pebble is slow... but still a little faster than you can run. Pets make you faster!',
      'You have a baseball bat in your hotbar. Try it on my training dummy over there. Click to swing!',
    ], () => setStep(2));
  } else if (save.step === 2) openDialog('Guide Gus', ['Go on, give that training dummy three good whacks!']);
  else if (save.step === 3) openDialog('Guide Gus', ['Now hop on Pebble! Walk right next to your turtle and press R.']);
  else if (save.step === 4) {
    openDialog('Guide Gus', [
      'Great riding! Now, listen closely...',
      'Big monsters live on this island. Each one guards a magic egg. Eggs hatch into pets!',
      'Beat a monster and it leaves a treasure chest. Spin it to win weapons and armor!',
      'Here, take this RADAR. The red dot shows where to go, and it counts down the miles.',
      'The first monster is in the FOREST. When the radar says 0.0 miles, look for a giant rabbit hole!',
      'And when you get an egg, bring it home to the incubator in your house. Good luck!',
    ], () => { save.radar = true; setStep(5); showToast('You got a RADAR! (top right)', 3); });
  } else {
    const tips = [
      ['Every monster is stronger than the last one. Keep getting better gear from the chests!'],
      ['Rarer pets are faster. Ride them to get around quicker!'],
      ['Read your scrolls! The riddles tell you where the next monster is hiding.'],
      ['When a monster charges into a wall it gets dizzy. That\'s the time to hit it hardest!'],
      ['You can go back and fight a monster again for another egg. It\'ll be tougher though!'],
    ];
    openDialog('Guide Gus', tips[Math.floor(Math.random() * tips.length)]);
  }
}

// ---------- interacting ----------
function near(x, z, r) { return Math.hypot(player.pos.x - x, player.pos.z - z) < r; }
function interactTarget() {
  const A = arenaHere();
  if (G.world.name === 'overworld') {
    if (near(gus.root.position.x, gus.root.position.z, 3.2)) return { text: 'Talk to Guide Gus', go: () => { if (player.mounted) dismount(); talkToGus(); } };
    if (near(OVER.incubator.x, OVER.incubator.z, 2.6)) return eggCount() ? { text: 'Hatch an egg in the incubator', go: openHatch } : { text: 'The incubator is empty', go: () => showToast('Beat a monster to win an egg, then bring it here.') };
    if (save.rocket && near(OVER.rocketPad.x, OVER.rocketPad.z, 3.4)) return { text: 'Climb into the rocket ship', go: rocketLaunch };
  }
  if (A) {
    if (A.eggState === 'pedestal' && !A.eggFly && nearEggSpot(A) && !fightArena && !G.cutscene && A.boss.state !== 'dying') {
      return { text: A.defeated ? 'Take the egg' : 'Pick up the glowing egg', go: () => { if (player.mounted) { showToast('Hop off your pet first (R)'); return; } pickUpEgg(A); } };
    }
    if (A.chestState === 'ready' && near(CAVE.chest.x, CAVE.chest.z, 2.6)) return { text: 'Open the treasure chest', go: () => openChestSpin(A) };
    if (A.scrollState === 'ready' && near(CAVE.scroll.x, CAVE.scroll.z, 2.4)) return { text: 'Pick up the scroll', go: () => { A.scrollState = 'taken'; A.scroll.visible = false; if (!save.scrolls.includes(A.bossId)) save.scrolls.push(A.bossId); writeSave(); sfx('pickup'); showScroll(A.bossId); } };
    if (A.scubaState === 'ready' && near(A.scuba.position.x, A.scuba.position.z, 2.4)) return { text: 'Pick up the scuba gear', go: () => { A.scubaState = 'taken'; A.scuba.visible = false; save.scuba = true; writeSave(); sfx('pickup'); showToast('You got SCUBA GEAR! Now you can dive deep into the ocean.', 3.5); } };
  }
  return null;
}
function interact() {
  if (dialogState) { advanceDialog(); return; }
  if (frozen()) return;
  const t = interactTarget();
  if (t) t.go();
}
function updatePrompt() {
  let text = '';
  if (!frozen()) {
    const t = interactTarget();
    if (t) text = (touch.active ? 'Tap E: ' : '[E] ') + t.text;
    else if (!player.mounted && pet.model && G.world.name !== 'deep' && Math.hypot(pet.pos.x - player.pos.x, pet.pos.z - player.pos.z) < 3.2 && save.step >= 3) text = (touch.active ? 'Tap Ride: ' : '[R] ') + `Ride ${petShortName()}`;
    else if (G.world.name === 'overworld' && player.inWater && player.pos.x < OVER.oceanX) text = save.scuba ? (touch.active ? 'Hold Down to dive' : 'Hold Shift to dive') : 'You need scuba gear to dive';
  }
  const el = $('prompt');
  if (text) { el.textContent = text; el.hidden = false; } else el.hidden = true;
  const ri = $('rideInfo');
  if (player.mounted) { ri.textContent = `Riding ${PET_SPECIES[pet.species].name} · speed ${pet.speed}`; ri.hidden = false; } else ri.hidden = true;
  $('downBtn').hidden = !(player.inWater || G.world.name === 'deep');
  $('scrollBtn').hidden = !save.scrolls.length;
}

// ---------- attacking ----------
function attack() {
  if (frozen() || !G.running) return;
  const item = selectedItem();
  if (item && item.startsWith('egg:')) {
    if (G.world.name === 'overworld' && near(OVER.incubator.x, OVER.incubator.z, 2.6)) openHatch();
    else showToast('Take the egg home and put it in the Egg Incubator to hatch it!');
    return;
  }
  if (player.swingCd > 0) return;
  const wpn = item === 'weapon' ? WEAPONS[save.weapon] : WEAPONS.bat;
  player.swingCd = wpn.cd;
  player.swingT = 0.25;
  if (wpn.kind === 'gun') { shoot(save.weapon); return; }
  sfx('swing');
  if (G.world.name === 'overworld') {
    const dp = dummy.root.position;
    const dx = dp.x - player.pos.x, dz = dp.z - player.pos.z, d = Math.hypot(dx, dz);
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    if (d < 3.3 && ((dx * fx + dz * fz) / (d || 1) > 0.2 || d < 1.4)) {
      dummy.wobbleV += 9 * (Math.random() < 0.5 ? -1 : 1);
      sfx('thud');
      burst(new THREE.Vector3(dp.x, dp.y + 1.4, dp.z), 0xd8b43a, 8, 3, 0.12, 0.6);
      damageNumber(String(wpn.dmg), new THREE.Vector3(dp.x, dp.y + 2.4, dp.z));
      if (save.step === 2) {
        save.dummyHits++;
        if (save.dummyHits >= 3) { setStep(3); showToast('Great swing! Now try riding Pebble.'); } else writeSave();
      }
    }
  } else {
    const A = bossInReach(wpn.reach);
    if (A) damageBoss(A, wpn.dmg);
  }
}

// ---------- the treasure chest spinner ----------
function prizeInfo(p) {
  const [kind, v] = p;
  if (kind === 'weapon') { const w = WEAPONS[v]; return { name: w.name, rarity: w.rarity, icon: weaponIconUrl(v), stat: w.kind === 'gun' ? `Gun · ${w.dmg} damage per shot` : `${w.dmg} damage` }; }
  const a = ARMORS[v];
  return { name: a.name, rarity: a.rarity, icon: armorIconUrl(v), stat: `Blocks ${Math.round(a.block * 100)}% of damage` };
}
function ownsPrize(p) { return p[0] === 'weapon' ? save.weapons.includes(p[1]) : save.armor >= p[1]; }
function samePrize(a, b) { return a[0] === b[0] && a[1] === b[1]; }

function openChestSpin(A) {
  const chest = CHESTS[A.cfg.chest];
  A.chestState = 'opened';
  sfx('chest');
  const lidOpen = () => { A.chest.lid.rotation.x = Math.max(-1.9, A.chest.lid.rotation.x - 0.12); if (A.chest.lid.rotation.x > -1.9) requestAnimationFrame(lidOpen); };
  lidOpen();
  burst(new THREE.Vector3(CAVE.chest.x, CAVE.floor + 1, CAVE.chest.z), 0xffcf4a, 30, 5, 0.15, 1.0);
  // what you win: rolled from the chances, skipping things you already have when possible
  const fresh = chest.prizes.filter(([p]) => !ownsPrize(p));
  const result = weightedPick(fresh.length ? fresh : chest.prizes);
  const N = 46, WIN = 40;
  const strip = $('spinStrip');
  strip.innerHTML = '';
  strip.style.transition = 'none';
  strip.style.transform = 'translateX(0px)';
  const cards = [];
  for (let i = 0; i < N; i++) {
    const p = i === WIN ? result : weightedPick(chest.prizes);
    const info = prizeInfo(p);
    const c = document.createElement('div');
    c.className = 'prize';
    c.style.setProperty('--rar', RARITY[info.rarity]);
    c.innerHTML = '<img alt=""><span class="pname"></span>';
    c.querySelector('img').src = info.icon;
    c.querySelector('.pname').textContent = info.name;
    strip.appendChild(c);
    cards.push(c);
  }
  $('spinTitle').textContent = chest.name;
  $('spinResult').textContent = 'Spinning...';
  $('spinResult').style.color = '';
  $('spinCollect').hidden = true;
  const odds = oddsText(chest.prizes).map(([p, pct]) => `${prizeInfo(p).name} ${pct}%`).join(' · ');
  $('spinOdds').textContent = 'Chances: ' + odds;
  setTimeout(() => {
    openModal('spinUI');
    requestAnimationFrame(() => {
      const view = $('spinView').getBoundingClientRect().width;
      const cw = cards[1].offsetLeft - cards[0].offsetLeft;
      const jitter = (Math.random() - 0.5) * cw * 0.6;
      const target = cards[WIN].offsetLeft + cards[WIN].offsetWidth / 2 - view / 2 + jitter;
      strip.getBoundingClientRect();
      strip.style.transition = 'transform 5.4s cubic-bezier(0.08, 0.6, 0.12, 1)';
      strip.style.transform = `translateX(${-target}px)`;
      let lastIdx = -1;
      const tick = () => {
        if (G.modal !== 'spinUI') return;
        const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
        const idx = Math.floor((-m.m41 + view / 2) / cw);
        if (idx !== lastIdx) { lastIdx = idx; sfx('tick'); }
        if ($('spinCollect').hidden) requestAnimationFrame(tick);
      };
      tick();
      setTimeout(() => {
        cards[WIN].classList.add('won');
        const info = prizeInfo(result);
        const dup = ownsPrize(result);
        $('spinResult').textContent = dup ? `${info.name} again! You already have it.` : `You got: ${info.name}! (${info.stat})`;
        $('spinResult').style.color = RARITY[info.rarity];
        sfx('prize');
        const btn = $('spinCollect');
        btn.hidden = false;
        btn.onclick = () => {
          if (!dup) {
            if (result[0] === 'weapon') { save.weapons.push(result[1]); save.weapon = result[1]; }
            else { save.armor = Math.max(save.armor, result[1]); player.model.setArmor(save.armor); }
          }
          writeSave(); updateHotbar(); updateHearts();
          if (result[0] === 'weapon' && !dup) { const i = hotbarItems().findIndex(it => it && it.id === result[1]); if (i >= 0) selectSlot(i); }
          closeModal();
          showToast(dup ? 'Better luck next chest!' : (result[0] === 'weapon' ? `${info.name} is in your hotbar!` : `You put on ${info.name}!`), 2.5);
        };
      }, 5600);
    });
  }, 500);
}

// ---------- scrolls ----------
function showScroll(bossId) {
  $('scrollText').textContent = BOSSES[bossId].scroll;
  $('scrollFrom').textContent = `Dropped by the ${BOSSES[bossId].name}`;
  openModal('scrollUI');
}
$('scrollOk').addEventListener('click', () => closeModal());
$('scrollBtn').addEventListener('pointerdown', e => { e.stopPropagation(); if (!G.modal && save.scrolls.length) showScroll(save.scrolls[save.scrolls.length - 1]); });

// ---------- hatching at home ----------
function openHatch() {
  if (G.modal) return;
  const held = selectedItem();
  let type = held && held.startsWith('egg:') ? held.slice(4) : Object.keys(EGGS).find(k => save.eggs[k] > 0);
  if (!type || !(save.eggs[type] > 0)) return;
  const e = EGGS[type];
  openModal('hatchUI');
  const egg = $('hatchEgg').querySelector('.egg');
  egg.style.setProperty('--shell', hex(e.shell)); egg.style.setProperty('--spotA', hex(e.spotA)); egg.style.setProperty('--spotB', hex(e.spotB));
  egg.className = 'egg wobble';
  $('hatchTitle').textContent = `Hatching the ${e.name}...`;
  $('hatchTitle').style.color = '';
  $('hatchText').textContent = 'Chances: ' + oddsText(e.odds).map(([id, pct]) => `${PET_SPECIES[id].name} ${pct}%`).join(' · ');
  $('hatchOk').hidden = true;
  [0, 0.6, 1.2, 1.8].forEach(t => setTimeout(() => tone(500 + t * 300, 0.06, 'square', 0.06), t * 1000));
  setTimeout(() => {
    const id = weightedPick(e.odds);
    const sp = PET_SPECIES[id];
    egg.className = 'egg pop';
    sfx('hatch');
    save.eggs[type]--;
    save.pets.push(id);
    const autoEquip = sp.speed > pet.speed;
    $('hatchTitle').textContent = sp.mutation ? `MUTATION! ${sp.name}!` : `You hatched a ${sp.name}!`;
    $('hatchTitle').style.color = RARITY[sp.rarity];
    $('hatchText').textContent = `${sp.rarity} pet · speed ${sp.speed} (you run at ${RUN_SPEED}).` + (autoEquip ? ' It\'s faster than your pet, so it\'s following you now!' : ' Press P to switch pets.');
    $('hatchOk').hidden = false;
    if (autoEquip) { save.active = save.pets.length - 1; spawnPet(id); placePetNearPlayer(); }
    writeSave();
    updateHotbar();
    const c = playerCenter();
    burst(c, 0xffcf4a, 30, 6, 0.15, 1.2); burst(c, e.spotA, 30, 6, 0.15, 1.2);
  }, 2400);
}
$('hatchOk').addEventListener('click', () => { $('hatchTitle').style.color = ''; closeModal(); });

// ---------- pets menu ----------
function openPets() {
  if (G.modal || dialogState || G.dead || G.cutscene) return;
  const list = $('petList');
  list.innerHTML = '';
  save.pets.forEach((id, i) => {
    const sp = PET_SPECIES[id];
    const card = document.createElement('div');
    card.className = 'petcard' + (i === save.active ? ' active' : '');
    card.innerHTML = '<div class="pname"></div><div class="prar"></div><div class="pspd"></div>';
    card.querySelector('.pname').textContent = sp.name;
    const r = card.querySelector('.prar'); r.textContent = sp.rarity + (sp.mutation ? ' · mutation' : ''); r.style.color = RARITY[sp.rarity];
    card.querySelector('.pspd').textContent = `Speed ${sp.speed}`;
    if (i !== save.active) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Use this pet';
      b.addEventListener('click', () => {
        save.active = i; writeSave();
        spawnPet(id);
        if (!player.mounted) placePetNearPlayer();
        closeModal();
        showToast(`${sp.name} is following you now!`);
      });
      card.appendChild(b);
    } else {
      const t = document.createElement('div'); t.className = 'pspd'; t.textContent = 'Following you';
      card.appendChild(t);
    }
    list.appendChild(card);
  });
  openModal('petsUI');
}
$('petsClose').addEventListener('click', () => closeModal());
$('petsBtn').addEventListener('pointerdown', e => { e.stopPropagation(); openPets(); });

// ---------- the rocket ship ----------
function rocketLaunch() {
  if (player.mounted) dismount();
  const start = rocket.position.clone();
  // watch from the middle of the village square
  player.pos.set(OVER.village.x + 2, OVER.village.h, start.z);
  player.vel.set(0, 0, 0);
  cam.yaw = Math.atan2(-(start.x - player.pos.x), -(start.z - player.pos.z));
  playCutscene({
    dur: 5.5, camDist: 4,
    events: [
      [0, cs => { G.hidePlayer = true; pet.model.root.visible = false; cs.lookAt = rocket.position; cs.pitch = 0.2; sfx('blastoff'); }],
      [0.6, cs => { cs.rocketUp = true; }],
      [4.6, () => { $('fade').classList.add('on'); }],
    ],
    tick: (cs, dt) => {
      if (cs.rocketUp) {
        cs.v = (cs.v || 0) + dt * 9;
        rocket.position.y += cs.v * dt;
        G.shake = 0.3;
        burst(rocket.position.clone(), Math.random() < 0.5 ? 0xffa94a : 0xff5a3c, 3, 4, 0.35, 0.8, -6);
      } else if (Math.random() < 0.5) burst(rocket.position.clone(), 0xdddddd, 2, 3, 0.4, 1, 1);
    },
    onEnd: () => {
      rocket.position.copy(start);
      G.hidePlayer = false; pet.model.root.visible = true;
      openModal('endUI');
      setTimeout(() => $('fade').classList.remove('on'), 300);
    },
  });
}
$('endOk').addEventListener('click', () => closeModal());

// ---------- cutscenes ----------
function playCutscene(def) {
  if (G.cutscene) return;
  for (const k in keys) keys[k] = false;
  const cs = Object.assign({ t: 0, fired: 0, walk: null, turn: null, lookAt: null, pitch: null }, def);
  cs.events = def.events.slice().sort((a, b) => a[0] - b[0]);
  cs.turnTo = (yaw, dur) => { cs.turn = { from: cam.yaw, to: cam.yaw + angleDiff(yaw, cam.yaw), t: 0, dur }; };
  G.cutscene = cs;
  document.body.classList.add('cinema');
  if (player.mounted && !def.keepMount) dismount();
}
function updateCutscene(dt) {
  const cs = G.cutscene;
  cs.t += dt;
  while (cs.fired < cs.events.length && cs.events[cs.fired][0] <= cs.t) { cs.events[cs.fired][1](cs); cs.fired++; }
  if (cs.turn) {
    cs.turn.t += dt;
    const p = Math.min(1, cs.turn.t / cs.turn.dur), e = p * p * (3 - 2 * p);
    cam.yaw = cs.turn.from + (cs.turn.to - cs.turn.from) * e;
    player.facing = cam.yaw + Math.PI;
    if (p >= 1) cs.turn = null;
  }
  cam.pitchOverride = cs.pitch;
  let hs = 0;
  if (!cs.freeze) {
    if (cs.walk) hs = updateMovement(dt, cs.walk.dx, cs.walk.dz, false, false, cs.walk.speed);
    else hs = updateMovement(dt, 0, 0, false, false);
    if (cs.walk) player.facing = Math.atan2(cs.walk.dx, cs.walk.dz);
  } else { player.vel.set(0, 0, 0); updatePetFollow(dt); }
  if (cs.tick) cs.tick(cs, dt);
  if (cs.t >= cs.dur) {
    G.cutscene = null;
    cam.pitchOverride = null;
    document.body.classList.remove('cinema');
    if (cs.onEnd) cs.onEnd();
  }
  return hs;
}

// two whales swim past each other, then the coral cave appears
function whaleCutscene() {
  const L = G.levels.deep;
  const P = player.pos.clone();
  const f = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const r = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const [w1, w2] = L.whales;
  const startA = P.clone().addScaledVector(f, 18).addScaledVector(r, -34).add(new THREE.Vector3(0, -1, 0));
  const startB = P.clone().addScaledVector(f, 24).addScaledVector(r, 34).add(new THREE.Vector3(0, 2, 0));
  playCutscene({
    dur: 10, freeze: true, camDist: 4,
    events: [
      [0, cs => { w1.visible = w2.visible = true; cs.pitch = 0.05; showToast('What\'s that sound...?', 2); }],
      [0.8, () => sfx('whale')],
      [3.2, () => sfx('whale')],
      [7.8, cs => {
        w1.visible = w2.visible = false;
        const c = P.clone().addScaledVector(f, 13);
        c.x = THREE.MathUtils.clamp(c.x, 8, DEEP.W - 8); c.z = THREE.MathUtils.clamp(c.z, 8, DEEP.D - 8);
        c.y = G.world.groundAt(c.x, c.z, DEEP.top - 1);
        for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 0; y < 12; y++) if (G.world.get(Math.floor(c.x) + x, Math.floor(c.y) + y, Math.floor(c.z) + z) === B.KELP) G.world.set(Math.floor(c.x) + x, Math.floor(c.y) + y, Math.floor(c.z) + z, B.WATER);
        G.world.rebuildAt(c.x, c.z);
        L.coralCave.position.copy(c);
        L.coralCave.rotation.y = Math.atan2(-f.x, -f.z);
        L.coralCave.visible = true;
        burst(c.clone().add(new THREE.Vector3(0, 3, 0)), 0xff6a9a, 40, 7, 0.3, 1.5, 0);
        sfx('chest');
        cs.lookAt = c; cs.pitch = 0.6;
        showToast('A CORAL CAVE appeared!', 2.5);
      }],
    ],
    tick: (cs, dt) => {
      const p = Math.min(1, cs.t / 7.8);
      w1.position.copy(startA).addScaledVector(r, p * 68);
      w2.position.copy(startB).addScaledVector(r, -p * 68);
      w1.rotation.y = Math.atan2(r.x, r.z); w2.rotation.y = Math.atan2(-r.x, -r.z);
    },
    onEnd: () => { G.whalesDone = true; },
  });
}

// ---------- modals ----------
function openModal(id) {
  G.modal = id;
  $(id).hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeModal() {
  if (G.modal) $(G.modal).hidden = true;
  G.modal = null;
  lockPointer();
}
$('respawnBtn').addEventListener('click', respawnAfterKO);

// ---------- pointer lock and mouse ----------
function lockPointer() {
  if (touch.active || mouse.fallback || !G.running) return;
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { mouse.fallback = true; });
  } catch (e) { mouse.fallback = true; }
}
document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement === canvas;
  if (!mouse.locked && G.running && !G.modal && !touch.active && !mouse.fallback) { G.paused = true; $('pause').hidden = false; }
  if (mouse.locked) { G.paused = false; $('pause').hidden = true; }
});
document.addEventListener('pointerlockerror', () => { mouse.fallback = true; G.paused = false; $('pause').hidden = true; });
$('pause').addEventListener('click', () => { G.paused = false; $('pause').hidden = true; lockPointer(); });

canvas.addEventListener('mousedown', e => {
  if (!G.running || touch.active) return;
  if (dialogState) { advanceDialog(); return; }
  if (!mouse.locked && !mouse.fallback) { lockPointer(); return; }
  if (mouse.fallback) { mouse.down = true; mouse.dragged = false; mouse.lastX = e.clientX; mouse.lastY = e.clientY; mouse.button = e.button; return; }
  if (e.button === 0) { mouse.attackHeld = true; attack(); }
  if (e.button === 2) interact();
});
window.addEventListener('mouseup', () => {
  mouse.attackHeld = false;
  if (mouse.fallback && mouse.down) {
    mouse.down = false;
    if (!mouse.dragged && G.running && !G.modal) { if (mouse.button === 2) interact(); else attack(); }
  }
});
window.addEventListener('mousemove', e => {
  if (G.cutscene) return;
  if (mouse.locked) { look(e.movementX, e.movementY); return; }
  if (mouse.fallback && mouse.down) {
    const dx = e.clientX - mouse.lastX, dy = e.clientY - mouse.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) mouse.dragged = true;
    if (mouse.dragged) look(dx * 1.6, dy * 1.6);
    mouse.lastX = e.clientX; mouse.lastY = e.clientY;
  }
});
function look(dx, dy) {
  if (G.cutscene) return;
  cam.yaw -= dx * 0.0026;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.0026, -0.35, 1.25);
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('wheel', e => { if (G.running && !G.modal) selectSlot(G.slot + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });

// ---------- keyboard ----------
window.addEventListener('keydown', e => {
  if (!G.running) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (G.cutscene) return;
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (G.modal) { if (e.code === 'KeyP' && G.modal === 'petsUI') closeModal(); return; }
  if (dialogState && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) { keys.Space = false; advanceDialog(); return; }
  if (e.code === 'KeyE') interact();
  else if (e.code === 'KeyR') toggleRide();
  else if (e.code === 'KeyP') openPets();
  else if (e.code === 'KeyF') attack();
  else if (/^Digit[1-9]$/.test(e.code)) selectSlot(Number(e.code.slice(5)) - 1);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- touch ----------
function enableTouch() {
  if (touch.active) return;
  touch.active = true;
  document.body.classList.add('is-touch');
  if (G.running) $('touch').hidden = false;
}
window.addEventListener('touchstart', enableTouch, { passive: true, once: true });
(() => {
  const stick = $('stick'), knob = $('knob');
  let id = null, cx = 0, cy = 0;
  stick.addEventListener('pointerdown', e => {
    id = e.pointerId; stick.setPointerCapture(id);
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e);
  });
  const move = e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy), max = 48;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.moveX = dx / max; touch.moveZ = -dy / max;
  };
  stick.addEventListener('pointermove', move);
  const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touch.moveX = touch.moveZ = 0; };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  let lookId = null, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    if (dialogState) { advanceDialog(); return; }
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return;
    look((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2);
    lx = e.clientX; ly = e.clientY;
  });
  const lookEnd = e => { if (e.pointerId === lookId) lookId = null; };
  canvas.addEventListener('pointerup', lookEnd);
  canvas.addEventListener('pointercancel', lookEnd);
  document.querySelectorAll('#tbtns button').forEach(b => {
    const t = b.dataset.t;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (t === 'jump') touch.jump = true;
      else if (t === 'down') touch.down = true;
      else if (t === 'attack') { touch.attack = true; attack(); }
      else if (t === 'ride') toggleRide();
      else if (t === 'interact') interact();
    });
    const up = () => { if (t === 'jump') touch.jump = false; if (t === 'down') touch.down = false; if (t === 'attack') touch.attack = false; };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  });
})();

// ---------- main loop ----------
let last = performance.now();
let noScubaHintT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.running) {
    if (G.level) {
      const t = now / 1000 * 0.05;
      camera.position.set(OVER.village.x + Math.cos(t) * 30, 34, OVER.village.z + Math.sin(t) * 30);
      camera.lookAt(OVER.village.x, 18, OVER.village.z);
      G.level.update(dt);
      renderer.render(scene, camera);
    }
    return;
  }
  if (G.paused) { renderer.render(scene, camera); return; }
  G.time += dt;
  let hs = 0;
  if (!frozen()) {
    hs = controlPlayer(dt);
    if (player.invuln > 0) player.invuln -= dt;
    if (player.swingCd > 0) player.swingCd -= dt;
    if ((mouse.attackHeld || touch.attack) && player.swingCd <= 0 && selectedItem() === 'weapon') attack();
    checkPlaces(dt);
    if (!fightArena && player.hp < player.maxHp) {
      G.regenT += dt;
      if (G.regenT > 2) { G.regenT = 0; player.hp++; updateHearts(); }
    }
    G.level.update(dt);
  } else if (G.cutscene) {
    hs = updateCutscene(dt);
    if (G.level) G.level.update(dt);
  }
  if (player.swingCd > 0 && frozen()) player.swingCd -= dt;
  updateBullets(dt);
  updatePlayerModel(dt, hs);
  updatePetModel(dt);
  updateParticles(dt);
  updateCamera(dt);
  updateDamageNumbers(dt);
  updateQuestHud();
  updatePrompt();
  renderer.render(scene, camera);
}

// walking into caves, diving, swimming back up
function checkPlaces(dt) {
  const a = player.mounted ? pet : player;
  const w = G.world.name;
  if (w === 'overworld') {
    for (const id in DOORS) {
      const d = DOORS[id];
      if (Math.hypot(a.pos.x - d.trigger.x, a.pos.z - d.trigger.z) < 1.8 && Math.abs(a.pos.y - d.floor) < 3) { travel(id); return; }
    }
    if (a.inWater && a.pos.x < OVER.oceanX - 10) {
      if (save.scuba && a.pos.y < OVER.water - 2.6) { travel('deep'); return; }
      noScubaHintT -= dt;
      if (!save.scuba && noScubaHintT <= 0 && Math.hypot(a.pos.x - OVER.diveSpot.x, a.pos.z - OVER.diveSpot.z) < 8) {
        noScubaHintT = 6;
        showToast('You need scuba gear to dive deep. The desert boss has some!', 3);
      }
    }
  } else if (w === 'deep') {
    G.diveT += dt;
    if (!G.whalesDone && (G.diveT >= DEEP.diveSeconds || player.pos.y < DEEP.cutsceneY)) whaleCutscene();
    if (player.pos.y > DEEP.top + 3) travel('overworld', 'deep');
  } else if (a.pos.z < CAVE.exitZ && !fightArena) travel('overworld', w);
}

// ---------- start ----------
function boot() {
  const play = $('playBtn');
  play.disabled = true;
  play.textContent = 'Building the island...';
  setTimeout(() => {
    buildLevels();
    setLevel('overworld');
    player.model = makePlayerModel();
    player.model.setArmor(save.armor);
    scene.add(player.model.root);
    placeActors(OVER.spawn.x, null, OVER.spawn.z, Math.PI * 0.05);
    spawnPet(save.pets[save.active] || 'turtle');
    placePetNearPlayer();
    updateHearts();
    updateHotbar();
    play.disabled = false;
    play.textContent = save.step > 0 ? 'Continue' : 'Play';
    $('resetBtn').hidden = save.step === 0 && save.pets.length === 1;
    requestAnimationFrame(frame);
  }, 30);
  play.addEventListener('click', start);
  $('resetBtn').addEventListener('click', () => { $('resetConfirm').hidden = false; });
  $('resetYes').addEventListener('click', () => {
    save = defaultSave(); writeSave();
    player.model.setArmor(0);
    spawnPet('turtle'); placePetNearPlayer();
    updateHearts(); updateHotbar();
    $('resetConfirm').hidden = true; $('resetBtn').hidden = true;
    play.textContent = 'Play';
  });
}
function start() {
  initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  $('title').hidden = true;
  $('hud').hidden = false;
  if (touch.active) $('touch').hidden = false;
  G.running = true;
  last = performance.now();
  lockPointer();
  if (save.step === 0) showToast('Welcome to MONSTER MASH!', 2.5);
}

const hurtFlash = document.createElement('div');
hurtFlash.id = 'hurtFlash';
document.body.appendChild(hurtFlash);
boot();
