/* UNWRITTEN login + account sync (Firebase Auth + Firestore).
   - Signed in: posts, notes, letter and streak days are saved to YOUR account (users/<your id>/data/...).
   - Signed out: those four are removed from this device, so the next person sees nothing.
   - If firebase-config.js is not filled in, this file does nothing and the site works as before. */
const C = window.LIHA_FIREBASE || {};
const V = '10.14.1';
const on = !!(C.apiKey && !/^PASTE/.test(C.apiKey) && C.projectId && !/^PASTE/.test(C.projectId));

const $ = s => document.querySelector(s);
const T = (k, fb) => (window.LihaT ? window.LihaT(k, fb) : fb || k);
const NAMES = { posts: 'liha.posts', notes: 'liha.notes', letter: 'liha.letter', days: 'liha.days', future: 'liha.future' };
const KEEP = ['liha.theme', 'liha.lang'];
const ls = {
  get(k) { try { return localStorage.getItem(k) } catch (e) { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  del(k) { try { localStorage.removeItem(k) } catch (e) {} }
};
const dirtyList = () => { try { return JSON.parse(ls.get('liha.dirty') || '[]') } catch (e) { return [] } };
const setDirty = (n, yes) => {
  const d = new Set(dirtyList()); yes ? d.add(n) : d.delete(n);
  ls.set('liha.dirty', JSON.stringify([...d]));
};
function wipeLocal() {                       /* remove everything of ours except theme + language */
  const gone = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('liha.') && !KEEP.includes(k)) gone.push(k) } } catch (e) {}
  gone.forEach(ls.del);
}

let fb = null, auth = null, db = null, user = null, mode = 'in', greet = false;
const timers = {};

/* the rest of the site calls these */
window.LihaSync = {
  push(name) {
    if (!on || !ls.get('liha.uid')) return;
    setDirty(name, true); status('wait');
    clearTimeout(timers[name]); timers[name] = setTimeout(() => flush(name), 900);
  },
  async eraseCloud() {
    if (!user || !fb) return;
    await Promise.all(Object.keys(NAMES).map(n => fb.deleteDoc(fb.doc(db, 'users', user.uid, 'data', n))));
    ls.del('liha.dirty');
  }
};
if (!on) { /* login not set up: nothing else to do */ }
else start();

/* ---------- small UI helpers ---------- */
function status(kind) {
  const el = $('#f-acct-text'); if (!el || !user) return;
  const msg = kind === 'saved' ? T('sync_saved') : kind === 'off' ? T('sync_off') : T('sync_wait');
  el.textContent = T('acct_as') + (user.email || '') + ' · ' + msg;
  const profileStatus = $('#profile-sync-status');
  if (profileStatus) profileStatus.textContent = msg;
}
function initials(name, email) { return (String(name || email || '?').trim()[0] || '?').toLocaleUpperCase() }
function setPhoto(img, url, fallback) {
  img.onerror = () => { img.hidden = true; fallback.hidden = false };
  if (url) { img.src = url; img.hidden = false; fallback.hidden = true }
  else { img.removeAttribute('src'); img.hidden = true; fallback.hidden = false }
}
function renderProfile(u, offline = false) {
  const name = u?.displayName || '';
  const email = u?.email || ls.get('liha.email') || '';
  const letter = initials(name, email);
  $('#profile-display-name').textContent = name || email;
  $('#profile-display-name').hidden = !name;
  $('#profile-email').textContent = email;
  $('#profile-initials').textContent = letter;
  $('#profile-initial-preview').textContent = letter;
  setPhoto($('#profile-photo'), u?.photoURL, $('#profile-initials'));
  setPhoto($('#profile-photo-preview'), u?.photoURL, $('#profile-initial-preview'));
  $('#profile-name').value = name;
  $('#profile-photo-url').value = u?.photoURL || '';
  $('#profile-name').disabled = !u || offline;
  $('#profile-photo-url').disabled = !u || offline;
  $('#profile-save').disabled = !u || offline;
  $('#profile-signout').hidden = !u || offline;
  $('#profile-delete').hidden = !u || offline;
  $('#profile-reset').hidden = !u || !u.email || offline || !u.providerData?.some(p => p.providerId === 'password');
  const list = (key) => { try { const v = JSON.parse(ls.get(key) || '[]'); return Array.isArray(v) ? v : [] } catch (e) { return [] } };
  $('#profile-posts').textContent = list('liha.posts').length;
  $('#profile-notes').textContent = list('liha.notes').filter(n => !/^n[1-4]$/.test(n?.id || '')).length;
  $('#profile-days').textContent = list('liha.days').length;
  if (offline) $('#profile-sync-status').textContent = T('profile_offline');
}
let profileReturnFocus = null;
function openProfile() {
  if ($('#profile-btn').hidden) return;
  profileReturnFocus = document.activeElement;
  renderProfile(user, !user);
  $('#profile').hidden = false;
  ($('#profile-name').disabled ? $('#profile-close') : $('#profile-name')).focus({ preventScroll: true });
}
function closeProfile() {
  $('#profile').hidden = true;
  if (profileReturnFocus?.isConnected && !profileReturnFocus.hidden) profileReturnFocus.focus({ preventScroll: true });
}
function lock(show) {                         /* show = the login card is visible */
  $('#login').hidden = !show;
  if (show) setTimeout(() => $('#a-email')?.focus({ preventScroll: true }), 50);
}
function nudge() {                              /* one gentle sign-in pop-up per session, never while someone is typing */
  if (C.requireLogin) return;
  let seen = false; try { seen = sessionStorage.getItem('liha.nudged') } catch {}
  if (seen) return;
  setTimeout(() => {
    if (user || !$('#login').hidden || document.documentElement.classList.contains('pinlocked')) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    try { sessionStorage.setItem('liha.nudged', '1') } catch {}
    $('#a-guest').hidden = false; lock(true);
  }, 25000);
}
function setMode(m) {
  mode = m;
  const up = m === 'up';
  const set = (sel, key, fb) => { const e = $(sel); e.dataset.i18n = key; e.textContent = T(key, fb) };
  set('#login-title', up ? 'signup_title' : 'login_title');
  set('#a-go', up ? 'signup_go' : 'login_signin');
  set('#a-mode', up ? 'login_to_signin' : 'login_to_signup');
  $('#a-pass').autocomplete = up ? 'new-password' : 'current-password';
  $('#a-forgot').hidden = up;
  err('');
}
function err(msg) { const e = $('#login-err'); e.textContent = msg; e.hidden = !msg }
function nice(e) {
  const c = (e && e.code) || '';
  if (/popup-closed|cancelled-popup|user-cancelled/.test(c)) return '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return T('err_creds');
  if (/email-already-in-use/.test(c)) return T('err_exists');
  if (/weak-password/.test(c)) return T('err_weak');
  if (/invalid-email|missing-email/.test(c)) return T('err_email');
  if (/too-many/.test(c)) return T('err_many');
  if (/network/.test(c)) return T('err_net');
  if (/popup-blocked/.test(c)) return T('err_popup');
  return T('err_generic');
}
function busy(yes) {
  ['#a-go', '#a-google'].forEach(s => { $(s).disabled = yes });
  const up = mode === 'up';
  $('#a-go').textContent = yes ? T(up ? 'creating' : 'signing_in') : T(up ? 'signup_go' : 'login_signin');
}

/* ---------- saving to the account ---------- */
async function flush(name) {
  if (!user || !fb || user.uid !== ls.get('liha.uid')) return;
  const v = ls.get(NAMES[name]);
  if (v === null) return;
  if (v.length > 900000) { window.LihaToast?.('Too much to sync. Please download a backup.'); return }
  try {
    await fb.setDoc(fb.doc(db, 'users', user.uid, 'data', name), { v, t: Date.now() });
    setDirty(name, false);
    if (!dirtyList().length) status('saved');
  } catch (e) { status('off') }
}
async function flushAll() { await Promise.all(dirtyList().map(n => flush(n))) }
async function signOutNow() {
  $('#profile-signout').disabled = $('#f-signout').disabled = true;
  try { await Promise.race([flushAll(), new Promise(r => setTimeout(r, 3000))]); await fb.signOut(auth) }
  catch (e) { wipeLocal(); location.reload() }
}

/* guest writing meeting account writing for the first time: keep both */
function merge(name, local, cloud) {
  try {
    const a = JSON.parse(local), b = JSON.parse(cloud);
    if (name === 'days') return JSON.stringify([...new Set([...a, ...b])].sort().slice(-400));
    if (name === 'posts' || name === 'notes' || name === 'future') {
      const have = new Set(b.map(x => x && x.id));
      return JSON.stringify([...a.filter(x => x && !have.has(x.id)), ...b]);
    }
  } catch (e) {}
  return cloud;                               /* letter: the account's copy wins */
}
async function pull(firstTime) {
  const dirty = new Set(dirtyList());
  let changed = false;
  const docs = await Promise.all(Object.keys(NAMES).map(async n => {
    const s = await fb.getDoc(fb.doc(db, 'users', user.uid, 'data', n));
    return [n, s.exists() ? s.data().v : null];
  }));
  for (const [n, cloud] of docs) {
    const key = NAMES[n], local = ls.get(key);
    let out = local;
    if (cloud !== null && local === null) out = cloud;
    else if (cloud !== null && local !== null && local !== cloud) out = dirty.has(n) ? local : firstTime ? merge(n, local, cloud) : cloud;
    if (out !== local) { ls.set(key, out); changed = true }
    if (out !== null && out !== cloud) { setDirty(n, true); await flush(n) }
  }
  return changed;
}

/* ---------- who is signed in ---------- */
async function onUser(u) {
  if (!u) {
    user = null;
    $('#profile-btn').hidden = true;
    $('#profile').hidden = true;
    if (ls.get('liha.uid')) { wipeLocal(); location.reload(); return }      /* signed out: nothing stays on this device */
    $('#f-acct').hidden = true; $('#f-signin').hidden = true; $('#f-signout').hidden = true;
    $('#f-acct-text').textContent = '';
    $('#guest-btn').hidden = false; nudge();
    if (C.requireLogin) { document.body.classList.add('locked'); lock(true) }
    $('#a-guest').hidden = !!C.requireLogin;
    return;
  }
  user = u;
  const prev = ls.get('liha.uid');
  if (prev && prev !== u.uid) wipeLocal();                                   /* another account used this device */
  ls.set('liha.uid', u.uid); ls.set('liha.email', u.email || '');
  document.body.classList.remove('locked'); lock(false);
  $('#guest-btn').hidden = true;
  $('#f-acct').hidden = false; $('#f-signin').hidden = true; $('#f-signout').hidden = false;
  $('#profile-btn').hidden = false;
  renderProfile(user);
  status('wait');
  try {
    const changed = await pull(!prev || prev !== u.uid);
    if (changed && !sessionStorage.getItem('liha.pulled')) { sessionStorage.setItem('liha.pulled', '1'); location.reload(); return }
    sessionStorage.removeItem('liha.pulled');
    status(dirtyList().length ? 'off' : 'saved');
    if (greet) { greet = false; window.LihaToast?.(T('welcome_in') + (u.displayName || (u.email || '').split('@')[0])) }
  } catch (e) { status('off') }
}

/* ---------- start ---------- */
async function start() {
  /* the login card works the same whether or not the network is up */
  $('#profile-btn').addEventListener('click', openProfile);
  $('#profile-close').addEventListener('click', closeProfile);
  $('#profile').addEventListener('click', e => { if (e.target === $('#profile')) closeProfile() });
  addEventListener('keydown', e => {
    const dialog = $('#profile');
    if (dialog.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeProfile(); return }
    if (e.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden])')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  });
  $('#profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#profile-name').value.trim(), rawPhoto = $('#profile-photo-url').value.trim(), error = $('#profile-err'), save = $('#profile-save');
    if (!name) { error.textContent = T('profile_name_required'); error.hidden = false; return }
    if (!user || !auth) return;
    let photoURL = null;
    if (rawPhoto) {
      try {
        const photo = new URL(rawPhoto, location.href);
        if (photo.protocol !== 'https:' && photo.origin !== location.origin) throw new Error('unsafe photo URL');
        photoURL = photo.href;
      } catch (e2) { error.textContent = T('profile_photo_error'); error.hidden = false; return }
    }
    error.hidden = true; save.disabled = true; save.textContent = T('profile_saving');
    try {
      await Au.updateProfile(auth.currentUser, { displayName: name, photoURL });
      user = auth.currentUser;
      renderProfile(user);
      status(dirtyList().length ? 'off' : 'saved');
      window.LihaToast?.(T('profile_saved'));
    } catch (e2) {
      error.textContent = T('profile_save_error'); error.hidden = false;
    }
    save.textContent = T('profile_save'); save.disabled = false;
  });
  $('#profile-photo-url').addEventListener('input', e => {
    const value = e.currentTarget.value.trim();
    try {
      const photo = new URL(value, location.href);
      if (value && (photo.protocol === 'https:' || photo.origin === location.origin)) {
        setPhoto($('#profile-photo-preview'), photo.href, $('#profile-initial-preview')); return;
      }
    } catch (e2) {}
    setPhoto($('#profile-photo-preview'), '', $('#profile-initial-preview'));
  });
  $('#profile-reset').addEventListener('click', async () => {
    const error = $('#profile-err'), button = $('#profile-reset'); error.hidden = true; button.disabled = true;
    try {
      await Au.sendPasswordResetEmail(auth, user.email);
      window.LihaToast?.(T('reset_sent'));
    } catch (e) { error.textContent = nice(e); error.hidden = false }
    button.disabled = false;
  });
  let profileSignoutTimer;
  $('#profile-signout').addEventListener('click', () => {
    const b = $('#profile-signout');
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.textContent = T('f_signout_confirm');
      profileSignoutTimer = setTimeout(() => { delete b.dataset.armed; b.textContent = T('f_signout') }, 4000); return;
    }
    clearTimeout(profileSignoutTimer); b.disabled = true;
    signOutNow();
  });
  $('#a-show').addEventListener('click', () => {
    const p = $('#a-pass'), show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    $('#a-show').dataset.i18n = show ? 'pw_hide' : 'pw_show';
    $('#a-show').textContent = T(show ? 'pw_hide' : 'pw_show');
  });
  let delT;
  $('#profile-delete').addEventListener('click', async () => {
    const b = $('#profile-delete'), error = $('#profile-err');
    const reset = () => { delete b.dataset.armed; b.textContent = T('profile_delete'); b.disabled = false };
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = T('profile_delete_confirm'); delT = setTimeout(reset, 4000); return }
    clearTimeout(delT); b.disabled = true; error.hidden = true;
    try {
      const last = Date.parse(auth.currentUser?.metadata?.lastSignInTime || '');
      if (last && Date.now() - last > 4 * 60 * 1000) { error.textContent = T('err_recent'); error.hidden = false; reset(); return }
      await window.LihaSync.eraseCloud();                 /* writing first, then the account itself */
      await Au.deleteUser(auth.currentUser);              /* this signs out, which clears this device and reloads */
    } catch (e) {
      error.textContent = /requires-recent-login/.test((e && e.code) || '') ? T('err_recent') : T('err_generic');
      error.hidden = false; reset();
    }
  });
  $('#a-mode').addEventListener('click', () => setMode(mode === 'in' ? 'up' : 'in'));
  $('#a-guest').addEventListener('click', () => lock(false));
  $('#guest-btn').addEventListener('click', () => { $('#a-guest').hidden = !!C.requireLogin; lock(true) });
  $('#f-signin').addEventListener('click', () => { $('#a-guest').hidden = !!C.requireLogin; lock(true) });
  let armT;
  $('#f-signout').addEventListener('click', async e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.textContent = T('f_signout_confirm');
      armT = setTimeout(() => { delete b.dataset.armed; b.textContent = T('f_signout') }, 3000); return;
    }
    clearTimeout(armT); b.disabled = true;
    signOutNow();
  });

  let mods;
  try {
    const base = 'https://www.gstatic.com/firebasejs/' + V + '/';
    mods = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  } catch (e) {                                /* offline or blocked: keep working with what is on this device */
    if (!ls.get('liha.uid') && C.requireLogin) { lock(true); err(T('offline_login')); $('#a-go').disabled = $('#a-google').disabled = true }
    else if (ls.get('liha.uid')) {
      $('#f-acct').hidden = false; $('#profile-btn').hidden = false;
      $('#f-acct-text').textContent = T('acct_as') + (ls.get('liha.email') || '') + ' · ' + T('sync_off');
      renderProfile(null, true);
    }
    return;
  }
  const [A, Au, F] = mods;
  try {
    const app = A.initializeApp({ apiKey: C.apiKey, authDomain: C.authDomain, projectId: C.projectId, appId: C.appId });
    auth = Au.getAuth(app); db = F.getFirestore(app);
  } catch (e) { console.error('UNWRITTEN login setup failed:', e); lock(true); err(T('err_generic')); return }
  fb = { doc: F.doc, getDoc: F.getDoc, setDoc: F.setDoc, deleteDoc: F.deleteDoc, signOut: () => Au.signOut(auth) };

  $('#a-google').addEventListener('click', async () => {
    err(''); busy(true);
    greet = true;
    try { await Au.signInWithPopup(auth, new Au.GoogleAuthProvider()) } catch (e) { greet = false; err(nice(e)) }
    busy(false);
  });
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault(); err('');
    const email = $('#a-email').value.trim(), pass = $('#a-pass').value;
    if (!email) return err(T('err_email'));
    if (mode === 'up' && pass.length < 8) return err(T('err_weak'));
    if (!pass) return err(T('err_creds'));
    busy(true);
    greet = true;
    try { await (mode === 'up' ? Au.createUserWithEmailAndPassword : Au.signInWithEmailAndPassword)(auth, email, pass) }
    catch (e2) { greet = false; err(nice(e2)) }
    busy(false);
  });
  $('#a-forgot').addEventListener('click', async () => {
    const email = $('#a-email').value.trim();
    if (!email) { err(T('need_email')); $('#a-email').focus(); return }
    try { await Au.sendPasswordResetEmail(auth, email); err(''); window.LihaToast?.(T('reset_sent')) } catch (e) { err(nice(e)) }
  });
  addEventListener('online', () => { if (user) flushAll() });
  Au.onAuthStateChanged(auth, onUser, e => { console.error('UNWRITTEN auth error:', e); $('#profile-btn').hidden = true; $('#profile').hidden = true; lock(true); err(T('err_generic')) });
}
