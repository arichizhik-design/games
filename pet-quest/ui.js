// HUD, tutorial, dialogue, menus, controls and the main loop.
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
  if (!el.children.length) for (let i = 0; i < 10; i++) { const im = document.createElement('img'); im.width = 18; im.height = 18; im.style.imageRendering = 'pixelated'; el.appendChild(im); }
  for (let i = 0; i < 10; i++) {
    const v = player.hp - i * 2;
    el.children[i].src = heartImgs[v >= 2 ? 1 : v >= 1 ? 0.5 : 0];
  }
  const a = ARMORS[save.armor];
  $('armorIcon').innerHTML = '';
  if (save.armor > 0) {
    const im = document.createElement('img');
    im.src = ICONS.armor('#' + a.color.toString(16).padStart(6, '0')).toDataURL();
    im.width = 18; im.height = 18; im.style.imageRendering = 'pixelated';
    const t = document.createElement('span');
    t.textContent = `${Math.round(a.block * 100)}% blocked`;
    $('armorIcon').append(im, t);
  }
}

// ---------- hotbar ----------
const iconUrls = {};
function iconUrl(name) { if (!iconUrls[name]) iconUrls[name] = ICONS[name]().toDataURL(); return iconUrls[name]; }
function hotbarItems() {
  const items = new Array(9).fill(null);
  items[0] = { kind: 'weapon', name: WEAPONS[save.weapon].name, icon: WEAPONS[save.weapon].icon };
  if (save.eggs > 0) items[1] = { kind: 'egg', name: 'Crystal Egg (click to hatch)', icon: 'egg', count: save.eggs };
  return items;
}
function selectedItem() { const it = hotbarItems()[G.slot]; return it ? it.kind : null; }
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
  items.forEach((it, i) => {
    const s = el.children[i];
    s.classList.toggle('sel', i === G.slot);
    s.innerHTML = `<span class="key">${i + 1}</span>` + (it ? `<img alt="" src="${iconUrl(it.icon)}">` + (it.count > 1 ? `<span class="count">${it.count}</span>` : '') : '');
  });
}
function selectSlot(i) {
  G.slot = (i + 9) % 9;
  updateHotbar();
  const it = hotbarItems()[G.slot];
  $('itemName').textContent = it ? it.name : '';
  clearTimeout(itemNameTimer);
  itemNameTimer = setTimeout(() => { $('itemName').textContent = ''; }, 2200);
}

// ---------- tutorial / quests ----------
function setStep(n) {
  if (n <= save.step && n !== 7) return;
  save.step = n;
  writeSave();
  if (n > 0) sfx('step');
}
function questInfo() {
  const inCave = G.world && G.world.name === 'cave';
  switch (save.step) {
    case 0: return { text: touch.active ? 'Walk with the joystick. Drag the screen to look around.' : 'Walk around with W A S D. Move the mouse to look around (click the game first).' };
    case 1: return { text: 'Talk to Guide Gus, the villager with the big nose. Walk up to him and press E.', target: { world: 'overworld', x: OVER.guide.x, z: OVER.guide.z, label: 'Guide Gus' } };
    case 2: return { text: `${touch.active ? 'Tap Swing' : 'Click'} to swing your bat at the training dummy. Hits: ${save.dummyHits}/3`, target: { world: 'overworld', x: OVER.dummy.x, z: OVER.dummy.z, label: 'Dummy' } };
    case 3: return { text: touch.active ? 'Ride Pebble! Walk next to your turtle and tap Ride. Tap Ride again to hop off.' : 'Ride Pebble! Walk next to your turtle and press R. Press R again to hop off.' };
    case 4: return { text: 'Nice riding! Go back and talk to Guide Gus (press E).', target: { world: 'overworld', x: OVER.guide.x, z: OVER.guide.z, label: 'Guide Gus' } };
    case 5: return { text: 'Go to the Crystal Caves! Follow the gravel path and the arrow. Ride Pebble to go faster.', target: { world: 'overworld', x: OVER.caveTrigger.x, z: OVER.caveTrigger.z, label: 'Crystal Caves' } };
    case 6: return { text: 'Follow the tunnel to the big crystal room. Shhh...', target: { world: 'cave', x: CAVE.start.x, z: CAVE.roomDoorZ + 4, label: 'Big room' } };
    case 7: return { text: 'The Crystal Golem is asleep next to a glowing egg. Sneak up and pick up the egg (press E).', target: { world: 'cave', x: nestEgg.home.x, z: nestEgg.home.z, label: 'Egg' } };
    case 8: return { text: 'Defeat the Crystal Golem! Get out of the red circles!' };
    case 9: return { text: 'Open the treasure chest (walk up and press E).', target: { world: 'cave', x: CAVE.chest.x, z: CAVE.chest.z, label: 'Chest' } };
    case 10: return { text: touch.active ? 'Hatch your egg! Tap slot 2 to hold it, then tap Swing.' : 'Hatch your egg! Press 2 to hold it, then click.' };
    default: {
      if (inCave && golem.state === 'sleep' && nestEgg.visible) return { text: `The Golem (level ${golemLevel() + 1}) is guarding a new egg. Grab it and win!`, target: { world: 'cave', x: nestEgg.home.x, z: nestEgg.home.z, label: 'Egg' } };
      if (inCave && G.inFight) return { text: 'Defeat the Crystal Golem! Get out of the red circles!' };
      if (inCave && chest.root.visible && !G.chestOpened) return { text: 'Open the treasure chest (press E).', target: { world: 'cave', x: CAVE.chest.x, z: CAVE.chest.z, label: 'Chest' } };
      if (save.eggs > 0) return { text: 'You have an egg to hatch! Press 2 to hold it, then click.' };
      if (inCave) return { text: 'Head back outside. When you come back in, the Golem returns with a new egg!', target: { world: 'cave', x: CAVE.start.x, z: 1, label: 'Way out' } };
      return { text: `Free play! The Crystal Golem (level ${golemLevel() + 1}) has a new egg. Win more pets and loot. Press P to see your pets.`, target: { world: 'overworld', x: OVER.caveTrigger.x, z: OVER.caveTrigger.z, label: 'Crystal Caves' } };
    }
  }
}
let lastQuest = '';
function updateQuestHud() {
  const q = questInfo();
  if (q.text !== lastQuest) { $('questText').textContent = q.text; lastQuest = q.text; }
  const c = $('compass');
  if (q.target && q.target.world === G.world.name) {
    const ax = player.mounted ? pet : player;
    const dx = q.target.x - ax.pos.x, dz = q.target.z - ax.pos.z;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    $('compassArrow').style.transform = `rotate(${ang}rad)`;
    $('compassText').textContent = `${q.target.label} · ${Math.round(Math.hypot(dx, dz))} m`;
    c.hidden = false;
  } else c.hidden = true;
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
      'Hi there, adventurer! I\'m Gus. Welcome to Blocky Village!',
      'See that little turtle following you? That\'s Pebble, your very first pet!',
      'Pets follow you everywhere. Pebble is slow... but still a little faster than you can run!',
      'You have a trusty baseball bat in your hotbar. Try it on my training dummy over there. Click to swing!',
    ], () => setStep(2));
  } else if (save.step === 2) {
    openDialog('Guide Gus', ['Go on, give that training dummy three good whacks with your bat!']);
  } else if (save.step === 3) {
    openDialog('Guide Gus', ['Now hop on Pebble! Walk right next to your turtle and press R.']);
  } else if (save.step === 4) {
    openDialog('Guide Gus', [
      'Nice riding! Now for a real adventure.',
      'Far away, inside the big mountain with the purple light, are the CRYSTAL CAVES.',
      'People say a giant Crystal Golem sleeps deep inside, guarding a magic egg...',
      'Eggs hatch into pets! A new pet could be way faster than Pebble.',
      'Follow the gravel path and the arrow at the top of your screen. Good luck!',
    ], () => setStep(5));
  } else {
    const tips = [
      ['The Crystal Caves are at the end of the gravel path, under the purple light.'],
      ['Rarer pets run faster! A Rainbow Dragon is the fastest pet of all.'],
      ['Every time you beat the Golem, it comes back stronger with a new egg.', 'Open the chest after each fight for better weapons or armor!'],
      ['When the Golem charges into a wall it gets dizzy. That\'s when you hit it hardest!'],
    ];
    openDialog('Guide Gus', tips[Math.floor(Math.random() * tips.length)]);
  }
}

// ---------- interacting ----------
function nearGus() { return G.world.name === 'overworld' && Math.hypot(player.pos.x - gus.root.position.x, player.pos.z - gus.root.position.z) < 3.2; }
function nearChest() {
  return G.world.name === 'cave' && chest.root.visible && !G.chestOpened &&
    Math.hypot(player.pos.x - CAVE.chest.x, player.pos.z - CAVE.chest.z) < 2.6;
}
function interact() {
  if (dialogState) { advanceDialog(); return; }
  if (frozen()) return;
  if (nearGus()) { if (player.mounted) dismount(); talkToGus(); return; }
  if (nearEgg()) { if (player.mounted) { showToast('Hop off your pet to pick up the egg (press R)'); return; } pickUpEgg(); return; }
  if (nearChest()) { openChest(); return; }
}
function updatePrompt() {
  let text = '';
  if (dialogState || frozen()) text = '';
  else if (nearGus()) text = '[E] Talk to Guide Gus';
  else if (nearEgg()) text = '[E] Pick up the glowing egg';
  else if (nearChest()) text = '[E] Open the treasure chest';
  else if (!player.mounted && pet.model && Math.hypot(pet.pos.x - player.pos.x, pet.pos.z - player.pos.z) < 3.2 && save.step >= 3) text = `[R] Ride ${petShortName()}`;
  if (touch.active) text = text.replace('[E]', 'Tap E:').replace('[R]', 'Tap Ride:');
  const el = $('prompt');
  if (text) { el.textContent = text; el.hidden = false; } else el.hidden = true;
  const ri = $('rideInfo');
  if (player.mounted) { ri.textContent = `Riding ${PET_SPECIES[pet.species].name} · speed ${pet.speed}`; ri.hidden = false; }
  else ri.hidden = true;
}

// ---------- attacking ----------
function attack() {
  if (frozen() || !G.running) return;
  const item = selectedItem();
  if (item === 'egg') { tryHatch(); return; }
  if (player.swingCd > 0) return;
  const wpn = item === 'weapon' ? WEAPONS[save.weapon] : { dmg: 1, cd: 0.35 };
  player.swingCd = wpn.cd;
  player.swingT = 0.25;
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
        if (save.dummyHits >= 3) { setStep(3); showToast('Great swing! Now try riding Pebble.'); }
        else writeSave();
      }
    }
  } else if (golemInReach()) hitGolem();
}

// ---------- treasure chest ----------
function openChest() {
  G.chestOpened = true;
  sfx('chest');
  const lidOpen = () => {
    chest.lid.rotation.x = Math.max(-1.9, chest.lid.rotation.x - 0.12);
    if (chest.lid.rotation.x > -1.9) requestAnimationFrame(lidOpen);
  };
  lidOpen();
  burst(new THREE.Vector3(CAVE.chest.x, CAVE.floor + 1, CAVE.chest.z), 0xffcf4a, 30, 5, 0.15, 1.0);
  const choices = [];
  if (save.weapon < WEAPONS.length - 1) {
    const nw = WEAPONS[save.weapon + 1];
    choices.push({ icon: iconUrl(nw.icon), name: nw.name, stat: `Better weapon: ${nw.dmg} damage per hit (now ${WEAPONS[save.weapon].dmg})`, apply: () => { save.weapon++; showToast(`You got the ${nw.name}!`); } });
  }
  if (save.armor < ARMORS.length - 1) {
    const na = ARMORS[save.armor + 1];
    choices.push({ icon: ICONS.armor('#' + na.color.toString(16).padStart(6, '0')).toDataURL(), name: na.name, stat: `Armor: blocks ${Math.round(na.block * 100)}% of damage (now ${Math.round(ARMORS[save.armor].block * 100)}%)`, apply: () => { save.armor++; player.model.setArmor(save.armor); showToast(`You put on ${na.name}!`); } });
  }
  if (!choices.length) choices.push({ icon: iconUrl('egg'), name: 'Bonus Egg', stat: 'You have the best gear! Take an extra egg instead.', apply: () => { save.eggs++; showToast('You got a bonus egg!'); } });
  const box = $('chestChoices');
  box.innerHTML = '';
  choices.forEach(c => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'choice';
    el.innerHTML = `<img alt="" src="${c.icon}"><span class="cname"></span><span class="cstat"></span>`;
    el.querySelector('.cname').textContent = c.name;
    el.querySelector('.cstat').textContent = c.stat;
    el.addEventListener('click', () => {
      c.apply();
      writeSave();
      updateHotbar(); updateHearts();
      closeModal();
      if (save.step === 9) setStep(10);
    });
    box.appendChild(el);
  });
  setTimeout(() => openModal('chestUI'), 450);
}

// ---------- hatching ----------
function rollPet() {
  const total = EGG_ODDS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of EGG_ODDS) { r -= w; if (r < 0) return id; }
  return EGG_ODDS[0][0];
}
function tryHatch() {
  if (save.eggs <= 0) return;
  if (G.inFight) { showToast('No time to hatch eggs in a boss fight!'); return; }
  openModal('hatchUI');
  const egg = $('hatchEgg').querySelector('.egg');
  egg.className = 'egg wobble';
  $('hatchTitle').textContent = 'Hatching...';
  $('hatchText').textContent = 'The egg is wiggling!';
  $('hatchOk').hidden = true;
  [0, 0.6, 1.2, 1.8].forEach(t => setTimeout(() => tone(500 + t * 300, 0.06, 'square', 0.06), t * 1000));
  setTimeout(() => {
    const id = rollPet();
    const sp = PET_SPECIES[id];
    egg.className = 'egg pop';
    sfx('hatch');
    save.eggs--;
    save.pets.push(id);
    const best = save.pets.reduce((bi, p, i) => PET_SPECIES[p].speed > PET_SPECIES[save.pets[bi]].speed ? i : bi, 0);
    const autoEquip = best === save.pets.length - 1 && PET_SPECIES[id].speed > pet.speed;
    $('hatchTitle').textContent = `You hatched a ${sp.name}!`;
    $('hatchTitle').style.color = RARITY[sp.rarity];
    $('hatchText').textContent = `${sp.rarity} pet · speed ${sp.speed} (you run at ${RUN_SPEED}).` + (autoEquip ? ' It\'s your fastest pet, so it\'s your pet now!' : ' Press P to switch pets.');
    $('hatchOk').hidden = false;
    if (autoEquip) { save.active = save.pets.length - 1; spawnPet(id); placePetNearPlayer(); }
    writeSave();
    if (save.eggs <= 0 && G.slot === 1) G.slot = 0;
    updateHotbar();
    if (save.step === 10) setStep(11);
    const c = playerCenter();
    burst(c, 0xffcf4a, 30, 6, 0.15, 1.2); burst(c, 0x5ff0e6, 30, 6, 0.15, 1.2);
  }, 2400);
}
$('hatchOk').addEventListener('click', () => { $('hatchTitle').style.color = ''; closeModal(); });

// ---------- pets menu ----------
function openPets() {
  if (G.modal || dialogState || G.dead) return;
  const list = $('petList');
  list.innerHTML = '';
  save.pets.forEach((id, i) => {
    const sp = PET_SPECIES[id];
    const card = document.createElement('div');
    card.className = 'petcard' + (i === save.active ? ' active' : '');
    card.innerHTML = `<div class="pname"></div><div class="prar"></div><div class="pspd"></div>`;
    card.querySelector('.pname').textContent = sp.name;
    const r = card.querySelector('.prar'); r.textContent = sp.rarity; r.style.color = RARITY[sp.rarity];
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
window.addEventListener('mouseup', e => {
  mouse.attackHeld = false;
  if (mouse.fallback && mouse.down) {
    mouse.down = false;
    if (!mouse.dragged && G.running && !G.modal) { if (mouse.button === 2) interact(); else attack(); }
  }
});
window.addEventListener('mousemove', e => {
  if (mouse.locked) { look(e.movementX, e.movementY); return; }
  if (mouse.fallback && mouse.down) {
    const dx = e.clientX - mouse.lastX, dy = e.clientY - mouse.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) mouse.dragged = true;
    if (mouse.dragged) look(dx * 1.6, dy * 1.6);
    mouse.lastX = e.clientX; mouse.lastY = e.clientY;
  }
});
function look(dx, dy) {
  cam.yaw -= dx * 0.0026;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.0026, -0.35, 1.25);
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('wheel', e => { if (G.running && !G.modal) selectSlot(G.slot + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });

// ---------- keyboard ----------
window.addEventListener('keydown', e => {
  if (!G.running) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (G.modal) {
    if (e.code === 'KeyP' && G.modal === 'petsUI') closeModal();
    return;
  }
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
  // drag anywhere else to look around
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
      else if (t === 'attack') { touch.attack = true; attack(); }
      else if (t === 'ride') toggleRide();
      else if (t === 'interact') interact();
    });
    const up = () => { if (t === 'jump') touch.jump = false; if (t === 'attack') touch.attack = false; };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  });
})();

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.running) {
    // slow orbit over the village behind the title screen
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
    hs = updateMovement(dt);
    if (player.invuln > 0) player.invuln -= dt;
    if (player.swingCd > 0) player.swingCd -= dt;
    if ((mouse.attackHeld || touch.attack) && player.swingCd <= 0 && selectedItem() !== 'egg') attack();
    // walking into the caves, or out of them
    const a = player.mounted ? pet : player;
    if (G.world.name === 'overworld' && a.pos.x > OVER.caveTrigger.x && Math.abs(a.pos.z - (OVER.caveDoor.z + 0.5)) < 3.2) { G.wasMounted = player.mounted; travel('cave'); }
    if (G.world.name === 'cave' && a.pos.z < CAVE.exitZ && !G.inFight) { G.wasMounted = player.mounted; travel('overworld'); }
    if (G.world.name === 'cave' && save.step === 6 && a.pos.z > CAVE.roomDoorZ + 2) { setStep(7); showToast('Shhh... the Crystal Golem is sleeping!', 2.5); }
    if (!G.inFight && player.hp < player.maxHp) {
      G.regenT += dt;
      if (G.regenT > 2) { G.regenT = 0; player.hp++; updateHearts(); }
    }
    G.level.update(dt);
  }
  updatePlayerModel(dt, hs);
  updatePetModel(dt);
  updateParticles(dt);
  updateCamera(dt);
  updateDamageNumbers(dt);
  updateQuestHud();
  updatePrompt();
  renderer.render(scene, camera);
}

// ---------- start ----------
function boot() {
  const play = $('playBtn');
  play.disabled = true;
  play.textContent = 'Building world...';
  setTimeout(() => {
    buildLevels();
    resetGolem();
    setLevel('overworld');
    player.model = makePlayerModel();
    player.model.setArmor(save.armor);
    scene.add(player.model.root);
    const active = save.pets[save.active] || 'turtle';
    placeActors(OVER.spawn.x, OVER.spawn.z, Math.PI * 0.05);
    spawnPet(active);
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
  if (save.step === 0) showToast('Welcome to Pet Quest!', 2.5);
}

const hurtFlash = document.createElement('div');
hurtFlash.id = 'hurtFlash';
document.body.appendChild(hurtFlash);
boot();
