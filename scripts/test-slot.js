const { splitName, buildReel } = require('../public/js/animations/slot.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  ✓ ' + msg);
  } else {
    failed += 1;
    console.log('  ✗ ' + msg);
  }
}

function tail(built) {
  return built.reel.slice(built.firstWinner, built.stopIndex + 1);
}

const valeria = splitName('Valeria García González');
assert(valeria.join('|') === 'Valeria|García|González', 'separa Valeria García González');

const compuesto = splitName('  María del Carmen López de la Cruz Hernández  ');
assert(
  compuesto.join('|') === 'María|del|Carmen|López|de|la|Cruz|Hernández',
  'conserva el nombre compuesto palabra por palabra'
);
assert(splitName('Juan').length === 1, 'un solo nombre sigue siendo una palabra');
assert(splitName('').length === 0, 'nombre vacío no inventa palabras');

const employees = [
  { id: 'a', nombre: 'Luis García', atenuado: 1 },
  { id: 'b', nombre: 'Ana García', atenuado: 0 },
  { id: 'c', nombre: 'María del Carmen López de la Cruz Hernández', atenuado: 0 },
  { id: 'd', nombre: 'Pedro', atenuado: 0 },
];
const built = buildReel(employees, { id: 'c', nombre: 'María del Carmen López de la Cruz Hernández' }, 'sorteo-1');
const end = tail(built);
assert(end.map((item) => item.word).join('|') === compuesto.join('|'), 'el cierre es el nombre registrado, en orden');
assert(end.every((item) => item.employeeId === 'c' && item.spent === false), 'el cierre pertenece al ganador y no está gastado');
assert(built.reel.slice(0, built.firstWinner).every((item) => item.word), 'el recorrido no tiene palabras vacías');
assert(!built.reel.some((item) => item.employeeId === 'a' && item.spent === false), 'quien ya ganó va en gris en todas sus palabras');
const creamGarcia = built.reel.filter((item) => item.word === 'García' && item.employeeId === 'b');
const grayGarcia = built.reel.filter((item) => item.word === 'García' && item.employeeId === 'a');
assert(creamGarcia.length > 0 && creamGarcia.every((item) => !item.spent), 'el García disponible no se apaga');
assert(grayGarcia.length > 0 && grayGarcia.every((item) => item.spent), 'el García premiado sí se apaga');

const again = buildReel(
  [{ id: 'c', nombre: 'María del Carmen López de la Cruz Hernández', atenuado: 1 }],
  { id: 'c', nombre: 'María del Carmen López de la Cruz Hernández' },
  'sorteo-1'
);
assert(tail(again).every((item) => item.spent === false), 'el ganador de este sorteo no se pinta como ya premiado');
assert(tail(again).map((item) => item.word).join(' ') === compuesto.join(' '), 'el nombre mostrado coincide con el registro');

const solo = buildReel([{ id: 'd', nombre: 'Pedro', atenuado: 0 }], { id: 'd', nombre: 'Pedro' }, 'uno');
assert(tail(solo).length === 1 && tail(solo)[0].word === 'Pedro', 'un solo nombre aterriza en esa palabra');
assert(solo.firstWinner >= 20, 'hay recorrido antes de revelar');

const same = buildReel(employees, { id: 'c', nombre: 'María del Carmen López de la Cruz Hernández' }, 'sorteo-1');
assert(JSON.stringify(same.reel) === JSON.stringify(built.reel), 'la misma semilla repite el recorrido');

const pedro = buildReel(
  employees,
  { id: 'e', nombre: 'Pedro Torres Díaz' },
  'tres'
);
assert(pedro.columns.length === 3, 'un nombre de tres palabras abre tres carretes');
assert(pedro.prefixLength === 20, 'el giro compartido recorre nombres completos');
for (let i = 0; i < pedro.prefixLength; i += 1) {
  const ids = new Set(pedro.columns.map((col) => col[i].employeeId));
  assert(ids.size === 1, `la fila ${i} es la misma persona en todos los carretes`);
}
assert(
  pedro.columns.map((col) => col[col.length - 1].word).join('|') === 'Pedro|Torres|Díaz',
  'cada carrete se detiene en su palabra del ganador'
);
assert(pedro.columns.every((col) => col[col.length - 1].spent === false), 'la parada del ganador no va en gris');
const spentRow = pedro.columns[0].findIndex((cell) => cell.employeeId === 'a');
assert(spentRow >= 0 && pedro.columns.every((col) => col[spentRow].spent === true), 'quien ya ganó va en gris en la misma fila');
const anaRow = pedro.columns[0].findIndex((cell) => cell.employeeId === 'b');
assert(
  anaRow >= 0 && pedro.columns.map((col) => col[anaRow].word).filter(Boolean).join(' ') === 'Ana García',
  'nombre y apellido bajan juntos en la misma línea'
);
assert(JSON.stringify(buildReel(employees, { id: 'e', nombre: 'Pedro Torres Díaz' }, 'tres').columns) === JSON.stringify(pedro.columns), 'la misma semilla repite los carretes');

console.log('');
console.log(failed ? `Resultado: ${passed} passed, ${failed} failed` : `Resultado: ${passed} passed, 0 failed`);
process.exit(failed ? 1 : 0);
