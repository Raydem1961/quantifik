// Copia os módulos puros (CUB, CAD, tipos) de src/lib para functions/src/shared antes do build
// das Cloud Functions, para que frontend e backend usem exatamente o mesmo código de cálculo.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'functions', 'src', 'shared');
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const item of ['cad', 'cub', 'types.ts']) {
  cpSync(join(raiz, 'src', 'lib', item), join(destino, item), { recursive: true });
}
console.log('shared → functions/src/shared (cad, cub, types.ts)');
