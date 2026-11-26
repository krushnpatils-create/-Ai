'use strict';
const $ = (s) => document.querySelector(s);
const TEXT_EXT = /\.(txt|md|csv|json|js|ts|jsx|tsx|html|css|py|java|c|cpp|go|rs|php|rb|sql|ya?ml|xml|log|sh)$/i;
const IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_TEXT = 100 * 1024, MAX_IMG = 1.5 * 1024 * 1024, MAX_FILES = 4;
const SUGGESTIONS = [
  'Write a polite email asking my manager for two days of leave next week.',
  'Explain how HTTPS works, then quiz me with three questions.',
  'Find the bug: for (let i = 0; i <= arr.length; i++) { sum += arr[i]; }',
];

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Browser storage is full. Delete old chats.'); } },
};
let chats = store.get('atlas.chats', []);
let settings = Object.assign({ theme: 'auto', instructions: '' }, store.get('atlas.settings', {}));
let currentId = store.get('atlas.current', null);
let pending = [];
let busy = false;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const cur = () => chats.find((c) => c.id === currentId);

function save() {
  // Image data is kept in memory only, never written to storage.
  const slim = chats.map((c) => ({ ...c, messages: c.messages.map(({ images, ...m }) => m) }));
  store.set('atlas.chats', slim);
  store.set('atlas.current', currentId);
}
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}
function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.t = dark ? 'dark' : 'light';
}
const md = (t) => DOMPurify.sanitize(marked.parse(t, { gfm: true, breaks: true }));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function copy(t) {
  try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { toast('Copy failed. Select the text and copy manually.'); }
}

function renderList() {
  const ul = $('#list'); ul.innerHTML = '';
  if (!chats.length) { ul.innerHTML = '<li class="empty-list">No chats yet.</li>'; return; }
  chats.slice().sort((a, b) => b.updated - a.updated).forEach((c) => {
    const li = document.createElement('li'); if (c.id === currentId) li.className = 'on';
    li.innerHTML = `<button class="t">${esc(c.title)}</button><button class="x" aria-label="Delete chat">✕</button>`;
    li.querySelector('.t').onclick = () => { currentId = c.id; save(); document.body.classList.remove('open'); render(); };
    li.querySelector('.x').onclick = () => {
      if (!confirm(`Delete "${c.title}"?`)) return;
      chats = chats.filter((x) => x.id !== c.id);
      if (currentId === c.id) currentId = null;
      save(); render();
    };
    ul.appendChild(li);
  });
}

function enhance(root) {
  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.textContent.replace(/\n$/, '');
    const lang = (pre.querySelector('code')?.className.match(/language-(\S+)/) || [])[1] || 'code';
    const wrap = document.createElement('div'); wrap.className = 'code';
    wrap.innerHTML = `<div class="bar"><span>${esc(lang)}</span><button type="button">Copy code</button></div>`;
    wrap.querySelector('button').onclick = () => copy(code);
    pre.replaceWith(wrap); wrap.appendChild(pre);
  });
  root.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
}

function msgEl(m, isLast) {
  const d = document.createElement('div'); d.className = `msg ${m.role}`;
  if (m.role === 'user') {
    d.innerHTML = `<div class="bubble"></div>`;
    d.firstChild.textContent = m.display || m.content;
    if (m.files && m.files.length) d.insertAdjacentHTML('beforeend', `<div class="files">Attached: ${esc(m.files.join(', '))}</div>`);
  } else {
    d.innerHTML = `<div class="bot ${m.error ? 'err' : 'md'}"></div>`;
    const body = d.firstChild;
    if (m.error) body.textContent = m.content; else { body.innerHTML = md(m.content); enhance(body); }
    if (!m.error) {
      const a = document.createElement('div'); a.className = 'acts';
      a.innerHTML = '<button class="ghost" data-a="copy">Copy</button><button class="ghost" data-a="dl">Download</button>' + (isLast ? '<button class="ghost" data-a="re">Regenerate</button>' : '');
      a.onclick = (e) => {
        const k = e.target.dataset.a;
        if (k === 'copy') copy(m.content);
        if (k === 'dl') download(m.content);
        if (k === 're') regenerate();
      };
      d.appendChild(a);
    }
  }
  return d;
}
function download(text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = 'atlas-response.md'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function render() {
  renderList();
  const c = cur(), box = $('#msgs');
  $('#title').textContent = c ? c.title : 'New chat';
  box.innerHTML = '';
  const inner = document.createElement('div'); inner.className = 'inner'; box.appendChild(inner);
  if (!c || !c.messages.length) {
    inner.innerHTML = '<div class="welcome"><h2>What should we work on?</h2><p>Give an instruction in plain language. Atlas follows multi-step requests and remembers this conversation.</p><div class="sugg"></div></div>';
    SUGGESTIONS.forEach((s) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = s;
      b.onclick = () => { $('#input').value = s; $('#input').focus(); autosize(); };
      inner.querySelector('.sugg').appendChild(b);
    });
  } else {
    c.messages.forEach((m, i) => inner.appendChild(msgEl(m, i === c.messages.length - 1 && m.role === 'assistant')));
  }
  if (busy) inner.insertAdjacentHTML('beforeend', '<div class="msg" id="typing"><div class="dots"><i></i><i></i><i></i></div></div>');
  box.scrollTop = box.scrollHeight;
  $('#send').disabled = busy; $('#clear').disabled = !c || !c.messages.length;
}

function renderChips() {
  const el = $('#chips'); el.innerHTML = '';
  pending.forEach((f, i) => {
    const c = document.createElement('span'); c.className = 'chip';
    c.innerHTML = `${esc(f.name)}<button type="button" aria-label="Remove ${esc(f.name)}">✕</button>`;
    c.querySelector('button').onclick = () => { pending.splice(i, 1); renderChips(); };
    el.appendChild(c);
  });
}
function readFile(file, kind) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onerror = () => rej(new Error(`Could not read ${file.name}.`));
    r.onload = () => res(r.result);
    kind === 'text' ? r.readAsText(file) : r.readAsDataURL(file);
  });
}
$('#file').onchange = async (e) => {
  for (const f of e.target.files) {
    if (pending.length >= MAX_FILES) { toast(`Up to ${MAX_FILES} files per message.`); break; }
    try {
      if (IMG_TYPES.includes(f.type)) {
        if (f.size > MAX_IMG) { toast(`${f.name} is over 1.5 MB.`); continue; }
        const url = await readFile(f, 'data');
        pending.push({ name: f.name, image: { mediaType: f.type, data: url.split(',')[1] } });
      } else if (TEXT_EXT.test(f.name)) {
        if (f.size > MAX_TEXT) { toast(`${f.name} is over 100 KB.`); continue; }
        pending.push({ name: f.name, text: await readFile(f, 'text') });
      } else toast(`${f.name}: unsupported type. Use text, code or PNG/JPEG/WebP/GIF images.`);
    } catch (err) { toast(err.message); }
  }
  e.target.value = ''; renderChips();
};

async function callApi(c) {
  const instructions = settings.instructions.trim();
  const payload = { messages: c.messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content, ...(m.images && m.images.length ? { images: m.images } : {}) })) };
  if (instructions) payload.instructions = instructions;
  let res;
  try {
    res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch { throw new Error('Could not reach the server. Check your connection, and when running locally use "npm run dev".'); }
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`The server returned an unexpected response (${res.status}). If running locally, start it with "npm run dev".`);
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  if (typeof data.reply !== 'string' || !data.reply) throw new Error('The server returned an empty reply.');
  return data.reply;
}
async function ask() {
  const c = cur(); busy = true; render();
  try { c.messages.push({ id: uid(), role: 'assistant', content: await callApi(c) }); }
  catch (e) { c.messages.push({ id: uid(), role: 'assistant', content: e.message, error: true }); }
  busy = false; c.updated = Date.now(); save(); render(); $('#input').focus();
}
async function regenerate() {
  const c = cur(); if (!c || busy) return;
  while (c.messages.length && c.messages[c.messages.length - 1].role === 'assistant') c.messages.pop();
  if (c.messages.length) ask();
}
$('#form').onsubmit = (e) => {
  e.preventDefault(); if (busy) return;
  const text = $('#input').value.trim();
  if (!text && !pending.length) return;
  let content = text || 'Please review the attached file(s).';
  const images = pending.filter((f) => f.image).map((f) => f.image);
  pending.filter((f) => f.text !== undefined).forEach((f) => { content += `\n\n[Attached file: ${f.name}]\n\`\`\`\n${f.text}\n\`\`\``; });
  if (!cur()) {
    const c = { id: uid(), title: (text || pending[0].name).slice(0, 48), messages: [], updated: Date.now() };
    chats.push(c); currentId = c.id;
  }
  cur().messages.push({ id: uid(), role: 'user', content, display: text || content.split('\n')[0], files: pending.map((f) => f.name), ...(images.length ? { images } : {}) });
  $('#input').value = ''; pending = []; renderChips(); autosize(); save(); ask();
};
function autosize() { const t = $('#input'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }
$('#input').oninput = autosize;
$('#input').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#form').requestSubmit(); } };

$('#newChat').onclick = () => { currentId = null; document.body.classList.remove('open'); render(); $('#input').focus(); };
$('#clear').onclick = () => { const c = cur(); if (c && confirm('Clear all messages in this chat?')) { c.messages = []; save(); render(); } };
$('#menu').onclick = () => document.body.classList.add('open');
$('#scrim').onclick = () => document.body.classList.remove('open');
$('#theme').onclick = () => { settings.theme = document.documentElement.dataset.t === 'dark' ? 'light' : 'dark'; store.set('atlas.settings', settings); applyTheme(); };
$('#openSettings').onclick = () => { $('#setTheme').value = settings.theme; $('#setInstr').value = settings.instructions; $('#dlg').showModal(); };
$('#dlg').onclose = () => { settings.theme = $('#setTheme').value; settings.instructions = $('#setInstr').value; store.set('atlas.settings', settings); applyTheme(); };
$('#delAll').onclick = () => { if (confirm('Delete all chats? This cannot be undone.')) { chats = []; currentId = null; save(); render(); $('#dlg').close(); } };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

if (!cur()) currentId = null;
applyTheme(); render();
