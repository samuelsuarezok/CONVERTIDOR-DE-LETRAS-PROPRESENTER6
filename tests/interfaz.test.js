// Pruebas de interfaz: abre la app en Chrome headless y la maneja por CDP (sin dependencias, Node 22+).
// Usa un perfil temporal: no toca las canciones guardadas en tu navegador.
// Uso: node tests/interfaz.test.js [ruta/al/cargador-letras.html]   (Chrome en otra ruta: CHROME=/ruta/a/chrome)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'cargador-letras.html'));
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('No encontré Chrome. Indicá la ruta con la variable de entorno CHROME.'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cargador-letras-test-'));
const profile = path.join(tmp, 'perfil');
const resetPage = path.join(tmp, 'reset.html');
fs.writeFileSync(resetPage, '<!doctype html><meta charset="utf-8"><title>reset</title>');
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1400,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];

function cdp(method, params = {}) {
  const i = ++id; ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise(res => pending.set(i, res));
}
async function evaluate(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result.value;
}
// La app guarda al cerrarse (pagehide): para empezar limpio hay que salir de ella,
// limpiar el almacenamiento desde otra página file:// y recién ahí abrirla.
async function open({ clear = true, preset } = {}) {
  await cdp('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await cdp('Page.navigate', { url: pathToFileURL(resetPage).href }); await sleep(300);
  if (clear) await evaluate('localStorage.clear()');
  if (preset !== undefined) await evaluate(`localStorage.setItem('cargador-letras-v1', ${JSON.stringify(preset)})`);
  await cdp('Page.navigate', { url: pathToFileURL(file).href }); await sleep(600);
  await evaluate(HELPERS);
}

// Funciones inyectadas en la página: capturan descargas y simulan lo que haría una persona.
const HELPERS = `
window.__dl = [];
URL.createObjectURL = b => { window.__lastBlob = b; return 'blob:prueba-' + __dl.length; };
URL.revokeObjectURL = () => {};
{ const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){ if (this.download){ __dl.push({ name: this.download, blob: window.__lastBlob }); return; } return click.call(this); }; }
window.confirm = () => true;
window.sleep = ms => new Promise(r => setTimeout(r, ms));
window.setRaw = v => { const t = document.getElementById('raw'); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); };
window.setTitle = v => { const t = document.getElementById('title'); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); };
window.setVal = (id, v, ev = 'change') => { const e = document.getElementById(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event(ev, { bubbles: true })); };
window.songs = () => [...document.querySelectorAll('#songList .song')];
window.clickSong = i => songs()[i].querySelector('button.n').click();
window.slideTexts = () => [...document.querySelectorAll('#slidesWrap .screen > div')].map(d => d.textContent);
window.editSlide = (i, text) => { const ed = document.querySelectorAll('#slidesWrap [contenteditable]')[i]; ed.focus(); ed.textContent = text; ed.dispatchEvent(new Event('input', { bubbles: true })); return ed; };
window.bannerShown = () => getComputedStyle(document.getElementById('banner')).display !== 'none';
window.lastDl = async () => { const d = __dl[__dl.length - 1]; return d ? { name: d.name, text: await d.blob.text() } : null; };
true;
`;

const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail }); }

async function main() {
  let port;
  for (let i = 0; i < 75 && !port; i++) {
    await sleep(200);
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) {}
  }
  if (!port) throw new Error('Chrome no abrió el puerto de depuración');
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('excepción: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  let r;

  // 1. Las opciones valen para todas las canciones, no solo la abierta
  await open();
  r = await evaluate(`(async () => {
    setRaw('a\\nb\\nc\\nd'); await sleep(400);
    document.getElementById('addBtn').click(); setRaw('x\\ny\\nz\\nw'); await sleep(400);
    setVal('lps', 1); await sleep(100);
    const b = slideTexts().length; clickSong(0); await sleep(100);
    return { a: slideTexts().length, b };
  })()`);
  check('1. Cambiar "Líneas por diapositiva" se aplica también a las otras canciones', r.a === 4 && r.b === 4, JSON.stringify(r));

  // 2. El aviso de "editada a mano" sigue a la canción correcta
  await open();
  r = await evaluate(`(async () => {
    setRaw('a\\nb\\nc\\nd'); await sleep(400);
    editSlide(0, 'editado a mano').blur();
    setRaw('a\\nb\\nc\\nd\\ne'); await sleep(400);
    const enEditada = bannerShown();
    document.getElementById('addBtn').click(); await sleep(50);
    const enNueva = bannerShown();
    clickSong(0); await sleep(50);
    return { enEditada, enNueva, alVolver: bannerShown() };
  })()`);
  check('2. Aviso visible en la canción editada con cambios, oculto en las demás', r.enEditada && !r.enNueva && r.alVolver, JSON.stringify(r));

  // 3. Escribir y cambiar de canción enseguida
  await open();
  r = await evaluate(`(async () => {
    setRaw('uno\\ndos'); await sleep(400);
    document.getElementById('addBtn').click(); setRaw('tres\\ncuatro'); await sleep(400);
    clickSong(0); setRaw('uno\\ndos\\ncinco\\nseis'); clickSong(1); await sleep(500);
    return state.songs[0].slides.map(s => s.text);
  })()`);
  check('3. Escribir y cambiar de canción enseguida procesa la letra en la canción correcta', JSON.stringify(r) === JSON.stringify(['uno\ndos', 'cinco\nseis']), JSON.stringify(r));

  // 4. Ctrl+S mientras se edita una diapositiva
  await open();
  r = await evaluate(`(async () => {
    setTitle('Prueba'); setRaw('uno\\ndos'); await sleep(400);
    const ed = editSlide(0, 'texto corregido');
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await sleep(100);
    return await lastDl();
  })()`);
  check('4. Ctrl+S durante la edición de una diapositiva descarga el texto corregido', r && r.name === 'Prueba.txt' && r.text.includes('texto corregido'), JSON.stringify(r));

  // 5. Datos guardados dañados o incompletos
  let n0 = errors.length;
  await open({ clear: false, preset: '{"songs":null}' });
  r = await evaluate(`songs().length`);
  check('5. Arranca aunque los datos guardados estén dañados', r === 1 && errors.length === n0, JSON.stringify(r) + ' ' + errors.slice(n0).join(' | '));
  n0 = errors.length;
  await open({ clear: false, preset: '{"songs":[{"id":"a","title":"X","artist":"","ccli":"","raw":"hola","slides":[],"edited":false}],"current":"zzz","opts":{}}' });
  r = await evaluate(`({ songs: songs().length, lps: document.getElementById('lps').value, slides: slideTexts() })`);
  check('6. Arranca con canción actual inválida y opciones incompletas', r.songs === 1 && r.lps === '2' && r.slides[0] === 'hola' && errors.length === n0, JSON.stringify(r) + ' ' + errors.slice(n0).join(' | '));

  // 7. Guardado al cerrar la pestaña
  await open();
  r = await evaluate(`(() => {
    setRaw('recién escrito'); window.dispatchEvent(new Event('pagehide'));
    const st = JSON.parse(localStorage.getItem('cargador-letras-v1') || 'null');
    return !!st && st.songs.some(s => s.raw === 'recién escrito');
  })()`);
  check('7. Lo escrito justo antes de cerrar la pestaña queda guardado', r === true, JSON.stringify(r));

  // 8. "Unir" en la última diapositiva
  await open();
  r = await evaluate(`(async () => {
    setRaw('a\\nb\\nc\\nd'); await sleep(400);
    const btns = document.querySelectorAll('#slidesWrap [data-a="merge"]');
    const lastDisabled = btns[btns.length - 1].disabled; btns[btns.length - 1].click(); await sleep(50);
    setRaw('a\\nb\\nc\\nd\\ne\\nf'); await sleep(400);
    return { lastDisabled, slides: slideTexts().length, banner: bannerShown() };
  })()`);
  check('8. "Unir" está deshabilitado en la última diapositiva y no bloquea actualizaciones', r.lastDisabled && r.slides === 3 && !r.banner, JSON.stringify(r));

  // 9. Descargas .txt y .pro6
  await open();
  r = await evaluate(`(async () => {
    setTitle('Cuán grande <es> "Él"'); setRaw('Verso 1\\nCuán grande es Él\\n\\nCoro\\n¡Aleluya! & amén'); await sleep(400);
    document.getElementById('dlBtn').click(); await sleep(50);
    const txt = await lastDl();
    const bytes = new Uint8Array(await __dl[__dl.length - 1].blob.arrayBuffer());
    setVal('fmt', 'pro6'); document.getElementById('dlBtn').click(); await sleep(50);
    const pro = await lastDl();
    const doc = new DOMParser().parseFromString(pro.text, 'application/xml');
    const plain = [...doc.querySelectorAll('NSString[rvXMLIvarName="PlainText"]')].map(n => new TextDecoder().decode(Uint8Array.from(atob(n.textContent), c => c.charCodeAt(0))));
    return { txtName: txt.name, bom: bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, txt: txt.text, proName: pro.name,
      xmlOk: !doc.querySelector('parsererror'), groups: [...doc.querySelectorAll('RVSlideGrouping')].map(g => g.getAttribute('name')), plain };
  })()`);
  check('9. .txt con BOM y una diapositiva por bloque', r.txtName === 'Cuán grande es Él.txt' && r.bom && r.txt === 'Cuán grande es Él\n\n¡Aleluya! & amén\n', JSON.stringify(r));
  check('10. .pro6 es XML válido con grupos y texto correctos', r.proName === 'Cuán grande es Él.pro6' && r.xmlOk && r.groups.join() === 'Verso 1,Coro' && r.plain[1] === '¡Aleluya! & amén', JSON.stringify(r));

  // 11. "Descargar todas"
  await open();
  r = await evaluate(`(async () => {
    setTitle('Misma'); setRaw('a\\nb\\nc\\nd'); await sleep(300);
    document.getElementById('addBtn').click(); setTitle('Misma'); setRaw('e\\nf'); await sleep(300);
    document.getElementById('addBtn').click(); await sleep(50);  // vacía: no se descarga
    setVal('lps', 1);
    __dl.length = 0; document.getElementById('allBtn').click(); await sleep(1200);
    return Promise.all(__dl.map(async d => ({ name: d.name, text: await d.blob.text() })));
  })()`);
  check('11. "Descargar todas": nombres únicos, opciones actuales y sin canciones vacías',
    Array.isArray(r) && r.length === 2 && r[0].name === 'Misma.txt' && r[1].name === 'Misma (2).txt' && r[0].text === 'a\n\nb\n\nc\n\nd\n', JSON.stringify(r));

  // 12. Arrastrar archivos .txt
  await open();
  r = await evaluate(`(async () => {
    const dt = new DataTransfer();
    dt.items.add(new File(['Coro\\nCuán grande es Él'], 'Cuan grande.txt', { type: 'text/plain' }));
    dt.items.add(new File([new Uint8Array([0x43,0x61,0x6E,0x63,0x69,0xF3,0x6E,0x0A,0x63,0x6F,0x72,0x61,0x7A,0xF3,0x6E])], 'Ansi.txt', { type: 'text/plain' })); // "Canción\\ncorazón" en Windows-1252
    document.getElementById('raw').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sleep(300);
    return { names: songs().map(s => s.querySelector('.n').textContent), raws: state.songs.map(s => s.raw), counts: state.songs.map(s => s.slides.length), title: document.getElementById('title').value };
  })()`);
  check('12. Arrastrar .txt crea canciones (reusa la vacía; tildes en UTF-8 y en Windows)',
    r.names.join('|') === 'Cuan grande|Ansi' && r.raws[1] === 'Canción\ncorazón' && r.counts.every(c => c > 0) && r.title === 'Ansi', JSON.stringify(r));

  // 13. Borrar todas las diapositivas
  await open();
  r = await evaluate(`(async () => {
    setRaw('a\\nb\\nc\\nd'); await sleep(400);
    while (document.querySelector('#slidesWrap [data-a="del"]')) document.querySelector('#slidesWrap [data-a="del"]').click();
    const empty = document.querySelector('#slidesWrap .empty').textContent, banner = bannerShown();
    document.getElementById('regenBtn').click();
    return { empty, banner, after: slideTexts().length, bannerAfter: bannerShown() };
  })()`);
  check('13. Borrar todas las diapositivas muestra el aviso y "Regenerar" las recupera', r.banner && /Borraste/.test(r.empty) && r.after === 2 && !r.bannerAfter, JSON.stringify(r));

  // 14. Teclado
  await open();
  r = await evaluate(`(async () => {
    document.getElementById('addBtn').click(); await sleep(50);
    const b = songs()[0].querySelector('button.n'); b.focus(); b.click(); await sleep(50);
    return { focusable: b.tabIndex >= 0, active: songs()[0].classList.contains('active'), focusOk: document.activeElement === songs()[0].querySelector('button.n') };
  })()`);
  check('14. Las canciones se eligen con teclado y el foco queda en la elegida', r.focusable && r.active && r.focusOk, JSON.stringify(r));

  // 15. Validación de opciones
  await open();
  r = await evaluate(`(async () => {
    setVal('fmt', 'pro6'); const bomOff = document.getElementById('oBom').disabled; setVal('fmt', 'txt');
    setVal('lps', '2.6', 'input'); setVal('lps', '2.6', 'change'); const v1 = document.getElementById('lps').value;
    setVal('lps', '', 'change'); const v2 = document.getElementById('lps').value;
    setVal('lps', '50', 'change'); const v3 = document.getElementById('lps').value;
    return { bomOff, bomOn: !document.getElementById('oBom').disabled, v1, v2, v3 };
  })()`);
  check('15. Opciones: BOM deshabilitado en .pro6; "Líneas" redondea, conserva el valor si queda vacío y respeta el máximo',
    r.bomOff && r.bomOn && r.v1 === '3' && r.v2 === '3' && r.v3 === '8', JSON.stringify(r));

  const unexpected = errors.slice();
  for (const x of results) console.log((x.ok ? 'OK   ' : 'FALLA') + '  ' + x.name + (x.ok ? '' : '\n        → ' + x.detail));
  console.log('\nErrores en la consola de la página: ' + (unexpected.length ? unexpected.join(' | ') : 'ninguno'));
  const fails = results.filter(x => !x.ok).length + (unexpected.length ? 1 : 0);
  console.log(fails ? fails + ' prueba(s) fallaron' : 'Todas las pruebas pasaron');
  return fails;
}

main()
  .then(fails => { process.exitCode = fails ? 1 : 0; })
  .catch(e => { console.error(e); process.exitCode = 2; })
  .finally(async () => {
    try { ws && ws.close(); } catch (e) {}
    const exited = new Promise(r => chrome.once('exit', r)); chrome.kill(); await exited;
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
