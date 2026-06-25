// host.js — the generic JS host + this app's API orchestration. The wasm client is
// a pure view: it renders whatever load() gives it. Every mutation goes through the
// server (Postgres is the source of truth, scoped to the session's user), then we
// reload the client from /api/notes — the keyed list patches only what changed.
let mem;
const dec = new TextDecoder(), enc = new TextEncoder();
const cstr = (p) => { const b = new Uint8Array(mem.buffer); let e = p; while (b[e]) e++; return dec.decode(b.subarray(p, e)); };

const env = {
  dom_mount: (r, h) => { document.getElementById(cstr(r)).innerHTML = cstr(h); },
  dom_patch: (s, v) => { const el = document.querySelector('[data-s="' + cstr(s) + '"]'); if (el) el.textContent = cstr(v); },
  list_insert: (c, k, h) => { const li = document.createElement('li'); li.dataset.k = cstr(k); li.innerHTML = cstr(h); document.getElementById(cstr(c)).appendChild(li); },
  list_remove: (c, k) => { const el = document.querySelector('#' + cstr(c) + ' > [data-k="' + cstr(k) + '"]'); if (el) el.remove(); },
  list_order: (c, csv) => { const ct = document.getElementById(cstr(c)); for (const k of cstr(csv).split(',').filter(Boolean)) { const el = ct.querySelector('[data-k="' + k + '"]'); if (el) ct.appendChild(el); } },
};
const wasi = { fd_write: () => 0, fd_seek: () => 0, fd_close: () => 0, fd_fdstat_get: () => 0 };

const { instance } = await WebAssembly.instantiateStreaming(fetch('/app.wasm'), { env, wasi_snapshot_preview1: wasi });
mem = instance.exports.memory;
instance.exports._initialize?.();
instance.exports.start();

// hand a string INTO wasm: write its UTF-8 into a buffer the module alloc'd.
const sendString = (s, allocFn, useFn) => {
  const b = enc.encode(s);
  const p = Number(allocFn(BigInt(b.length)));
  new Uint8Array(mem.buffer).set(b, p);
  useFn(BigInt(p));
};

// fetch the current notes and reload the reactive view.
const reload = async () => {
  const json = await (await fetch('/api/notes')).text();
  sendString(json, instance.exports.load_buf, instance.exports.load);
};

const addNote = async () => {
  const inp = document.getElementById('note_input');
  const body = inp.value.trim();
  if (!body) return;
  await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'body=' + encodeURIComponent(body) });
  inp.value = '';
  inp.focus();
  reload();
};

document.getElementById('app').addEventListener('click', async (e) => {
  if (e.target.id === 'note_add') return addNote();
  const row = e.target.closest('[data-id]');
  if (row && e.target.dataset.act === 'del') {
    await fetch('/api/notes/del?id=' + row.dataset.id, { method: 'POST' });
    reload();
  }
});
document.getElementById('app').addEventListener('keydown', (e) => {
  if (e.target.id === 'note_input' && e.key === 'Enter') addNote();
});

reload();   // initial load
