// Pruebas del procesamiento de letras: ejecuta la sección "Procesamiento" de la app en Node.
// Uso: node tests/logica.test.js [ruta/al/cargador-letras.html]
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'cargador-letras.html');
const html = fs.readFileSync(file, 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const code = js.slice(js.indexOf('// ===== Procesamiento ====='), js.indexOf('// ===== Render ====='));
const api = new Function(code + '\nreturn { process, wrap, fixBreaks, unglue };')();

const base = { lps: 2, maxc: 40, caseMode: 'keep', chords: true, repeat: true, nums: true, punct: false };
const run = (raw, o = {}) => api.process(raw, { ...base, ...o });
const texts = sl => sl.map(s => s.text);
const groups = raw => run(raw).map(s => s.group).join(',');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const U = c => String.fromCharCode(c); // caracteres invisibles sin escribirlos literales en el código

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'OK   ' : 'FALLA') + '  ' + name + (cond ? '' : '\n        → ' + detail));
  if (!cond) fails++;
}

console.log('— Repeticiones');
{
  let sl = run('Coro\nSanto santo\nDigno es el Señor\n(x2)');
  check('"(x2)" solo en su línea repite la estrofa y no genera diapositiva',
    same(texts(sl), ['Santo santo\nDigno es el Señor', 'Santo santo\nDigno es el Señor']), JSON.stringify(texts(sl)));
  sl = run('Aleluya (bis)', { lps: 1 });
  check('"(bis)" repite la línea', same(texts(sl), ['Aleluya', 'Aleluya']), JSON.stringify(texts(sl)));
  sl = run('Aleluya ' + U(0xD7) + '2', { lps: 1 });
  check('"×2" repite la línea', same(texts(sl), ['Aleluya', 'Aleluya']), JSON.stringify(texts(sl)));
  sl = run('Te alabo [Bis]', { lps: 1 });
  check('"[Bis]" repite la línea', same(texts(sl), ['Te alabo', 'Te alabo']), JSON.stringify(texts(sl)));
  sl = run('Hola mundo, Dios está aquí (2 veces)', { lps: 1 });
  check('"(2 veces)" repite la línea', same(texts(sl), ['Hola mundo, Dios está aquí', 'Hola mundo, Dios está aquí']), JSON.stringify(texts(sl)));
  sl = run('El fénix 3');
  check('"El fénix 3" no se toma como repetición', same(texts(sl), ['El fénix 3']), JSON.stringify(texts(sl)));
  sl = run('Coro x0\nHola\nChau');
  check('"Coro x0" no borra la sección', sl.length === 1, JSON.stringify(texts(sl)));
  sl = run('Aleluya (x2)', { repeat: false });
  check('con "Expandir repeticiones" apagado se quita "(x2)" sin repetir', same(texts(sl), ['Aleluya']), JSON.stringify(texts(sl)));
  sl = run('Coro\nHola\n\nCoro', { repeat: false });
  check('con "Expandir repeticiones" apagado, "Coro" solo no duplica', sl.length === 1, JSON.stringify(sl));
}

console.log('— Etiquetas y grupos');
{
  const raw = 'Verso 1\nPrimera línea\nSegunda línea\n\nCoro\nLínea del coro (x2)\nOtra línea\n\nVerso 2\nTercera\nCuarta\n\nCoro';
  check('ejemplo de la app (placeholder)', groups(raw) === 'Verso 1,Coro,Coro,Verso 2,Coro,Coro', groups(raw));
  check('"Estribillo" = Coro', groups('Estribillo\nHola') === 'Coro', groups('Estribillo\nHola'));
  check('"Verso 2x" = Verso dos veces', groups('Verso 2x\nHola') === 'Verso,Verso', groups('Verso 2x\nHola'));
  check('"[Coro x2]"', groups('[Coro x2]\nHola') === 'Coro,Coro', groups('[Coro x2]\nHola'));
  check('"[Coro]" y "(Puente x2)"', groups('[Coro]\nHola\n\n(Puente x2)\nChau') === 'Coro,Puente,Puente', groups('[Coro]\nHola\n\n(Puente x2)\nChau'));
  check('variantes de Pre-coro', groups('Pre-coro\nUno\n\nPrecoro\n\nPre coro') === 'Pre-coro,Pre-coro,Pre-coro', groups('Pre-coro\nUno\n\nPrecoro\n\nPre coro'));
  let sl = run('Coro: Santo santo santo\nDigno es el Señor');
  check('"Coro: texto" en la misma línea', sl.length === 1 && sl[0].group === 'Coro' && sl[0].text === 'Santo santo santo\nDigno es el Señor', JSON.stringify(sl));
  sl = run('Coro x2: Santo santo\nDigno');
  check('"Coro x2: texto"', sl.length === 2 && sl[0].group === 'Coro' && sl[0].text === 'Santo santo\nDigno', JSON.stringify(sl));
  sl = run('Intro: G D Em C\n\nVerso 1\nHola');
  check('"Intro: G D Em C" no genera diapositiva', same(texts(sl), ['Hola']), JSON.stringify(sl));
  sl = run('Coro 1\nSanto santo\nSanto es\n\nVerso\nLínea\nOtra\n\nCoro');
  check('"Coro" solo repite "Coro 1"', sl.map(s => s.group).join() === 'Coro 1,Verso,Coro 1', JSON.stringify(sl));
  sl = run('Coro 1\nHola\n\nCoro 2');
  check('"Coro 2" sin letra no copia "Coro 1"', sl.length === 1, JSON.stringify(sl));
  sl = run('Coro\n\nVerso\nUno\n\nCoro\nHola');
  check('"Coro" vacío antes de definirse toma el de más adelante', sl.map(s => s.group).join() === 'Coro,Verso,Coro', JSON.stringify(sl));
  check('"Final de los tiempos" sigue siendo letra', same(texts(run('Final de los tiempos')), ['Final de los tiempos']), JSON.stringify(run('Final de los tiempos')));
  check('"Coros celestiales" sigue siendo letra', same(texts(run('Coros celestiales')), ['Coros celestiales']), JSON.stringify(run('Coros celestiales')));
}

console.log('— Acordes');
{
  let sl = run('G       D\nHola mundo\nAm  C/E  F\nChau mundo');
  check('líneas de acordes se quitan', same(texts(sl), ['Hola mundo\nChau mundo']), JSON.stringify(texts(sl)));
  sl = run('C G Am F (x2)\nHola mundo');
  check('línea de acordes con "(x2)" se quita', same(texts(sl), ['Hola mundo']), JSON.stringify(texts(sl)));
  sl = run('G  D/F#  Em7  C2 |\nHola\nBm7(b5)  E7(#9)  C7M  Asus4');
  check('acordes variados (C7M, Bm7(b5), |)', same(texts(sl), ['Hola']), JSON.stringify(texts(sl)));
  sl = run('[C#m7b5/G#]Hola [D]mundo');
  check('acordes entre corchetes se quitan, incluso largos', same(texts(sl), ['Hola mundo']), JSON.stringify(texts(sl)));
  sl = run('[Ah ah] Te alabo');
  check('"[Ah ah]" no es acorde y se conserva', same(texts(sl), ['[Ah ah] Te alabo']), JSON.stringify(texts(sl)));
}

console.log('— Texto y formato');
{
  let sl = run('¡aleluya!\n¿quién como tú?', { caseMode: 'first' });
  check('"Primera letra" con ¡ y ¿', same(texts(sl), ['¡Aleluya!\n¿Quién como tú?']), JSON.stringify(texts(sl)));
  sl = run('"santo es"\n3 veces santo', { caseMode: 'first' });
  check('"Primera letra" con comillas y números', same(texts(sl), ['"Santo es"\n3 veces santo']), JSON.stringify(texts(sl)));
  sl = run('hola mundo', { caseMode: 'upper' });
  check('TODO MAYÚSCULAS', same(texts(sl), ['HOLA MUNDO']), JSON.stringify(texts(sl)));
  sl = run('1. Primera\n2) Segunda');
  check('quita numeración', same(texts(sl), ['Primera\nSegunda']), JSON.stringify(texts(sl)));
  sl = run('1.\nUno\nDos\n2.\nTres\nCuatro');
  check('"1." / "2." sueltos separan estrofas', same(texts(sl), ['Uno\nDos', 'Tres\nCuatro']), JSON.stringify(sl));
  sl = run('Hola\n...\nChau', { punct: true });
  check('"Quitar puntuación" no deja líneas vacías', same(texts(sl), ['Hola\nChau']), JSON.stringify(texts(sl)));
  sl = run('Uno\vDos\rTres' + U(0x2028) + 'Cuatro', { lps: 1 });
  check('saltos de línea de Word (\\v), \\r suelto y U+2028', same(texts(sl), ['Uno', 'Dos', 'Tres', 'Cuatro']), JSON.stringify(texts(sl)));
  sl = run('Ho' + U(0x200B) + 'la' + U(0xA0) + 'mundo');
  check('caracteres invisibles se limpian', same(texts(sl), ['Hola mundo']), JSON.stringify(texts(sl)));
  sl = run('a\nb\nc\nd', { lps: 1.5 });
  check('"Líneas por diapositiva" no entero se redondea', same(texts(sl), ['a\nb', 'c\nd']), JSON.stringify(texts(sl)));
  const w = api.wrap('Cuán grande es Él, cuán grande es Él, mi corazón entona la canción', 30);
  check('líneas largas: no superan el máximo y prefieren cortar en comas', w.every(l => l.length <= 30) && w[0] === 'Cuán grande es Él,', JSON.stringify(w));
}

console.log('— Pegado de letras');
{
  const raw = 'a' + U(0x0B) + 'b' + U(0x2028) + 'c\r\nd\re' + U(0x2029) + 'f' + U(0x85) + 'g\fh';
  const fixed = api.fixBreaks(raw);
  check('saltos de Word/PowerPoint (\\v), Pages/Keynote/ProPresenter (U+2028) y otros pasan a Enter', fixed === 'a\nb\nc\nd\ne\nf\ng\nh', JSON.stringify(fixed));
  const glued = 'Señor mi Dios, al contemplar los cielosEl firmamento y las estrellas mil¡Cuán grande es Él!Mi corazón entona la canción';
  const u = api.unglue(glued);
  check('renglones pegados ("cielosEl", "mil¡Cuán", "Él!Mi") se separan',
    u === 'Señor mi Dios, al contemplar los cielos\nEl firmamento y las estrellas mil\n¡Cuán grande es Él!\nMi corazón entona la canción', JSON.stringify(u));
  for (const ok of ['Te alabo mi Señor Jesús, eres mi Dios y Rey', 'Lo vi en mi iPhone ayer', 'Desde EE.UU. hasta Argentina', '¡Aleluya! ¿Quién como Tú?']) {
    check('texto normal no se toca: "' + ok + '"', api.unglue(ok) === ok, JSON.stringify(api.unglue(ok)));
  }
}

console.log('— Rendimiento (entradas extremas)');
{
  const o = { caseMode: 'first', punct: true };
  const cases = {
    '10.000 líneas': Array.from({ length: 10000 }, (_, i) => i % 7 === 0 ? '' : i % 13 === 0 ? 'Coro x2' : 'Cuán grande es Él, cuán grande es Él (x2)').join('\n'),
    'línea de 20.000 caracteres': 'palabra '.repeat(2500),
    'etiqueta con 20.000 espacios': 'Coro' + ' '.repeat(20000) + 'z',
    'corchetes repetidos': '[a'.repeat(10000),
    '5.000 acordes en una línea': 'C G Am F '.repeat(1250) + 'hola',
  };
  for (const [name, raw] of Object.entries(cases)) {
    const t = Date.now(); run(raw, o); const ms = Date.now() - t;
    check(name + ' (' + ms + ' ms)', ms < 2000, ms + ' ms');
  }
}

console.log('\n' + (fails ? fails + ' prueba(s) fallaron' : 'Todas las pruebas pasaron'));
process.exitCode = fails ? 1 : 0;
