// Servidor estático mínimo para o tier E2E — zero dependências.
//
// O Avenco é servido pelo GitHub Pages como arquivos estáticos da raiz do
// repositório. Este servidor reproduz isso localmente para o Playwright, sem
// introduzir nenhuma dependência de build ou framework.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORTA = Number(process.env.AVENCO_TEST_PORT || 4173);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  let relativo = decodeURIComponent(url.pathname);
  if (relativo === '/' || relativo.endsWith('/')) relativo += 'index.html';

  // Impede escapar da raiz do repositório.
  const destino = path.resolve(RAIZ, '.' + relativo);
  if (!destino.startsWith(RAIZ)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(destino, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found: ' + relativo);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(conteudo);
  });
});

servidor.listen(PORTA, () => {
  console.log(`Avenco servido em http://localhost:${PORTA} (raiz: ${RAIZ})`);
});
