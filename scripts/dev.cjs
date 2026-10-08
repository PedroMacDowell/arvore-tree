// Sobe backend (com --watch) e frontend (Vite) juntos. Ctrl+C encerra os dois.
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const services = [
  { name: 'Backend', port: 3001, cwd: 'backend', args: ['--watch', 'server.js'] },
  { name: 'Frontend', port: 5173, cwd: 'frontend', args: ['node_modules/vite/bin/vite.js', '--port', '5173', '--strictPort'] },
];
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}

function isFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

(async () => {
  for (const { port } of services) {
    if (!(await isFree(port))) {
      console.error(`A porta ${port} está ocupada. Encerre o serviço anterior (Ctrl+C no terminal dele) e rode npm run dev de novo.`);
      process.exitCode = 1;
      return;
    }
  }
  for (const service of services) {
    const child = spawn(process.execPath, service.args, { cwd: path.join(root, service.cwd), stdio: 'inherit', windowsHide: true });
    children.push(child);
    child.on('error', error => { console.error(`${service.name}: ${error.message}`); stop(1); });
    child.on('exit', code => { if (!stopping) stop(code ?? 1); });
  }
  console.log('Árvore da Amazônia: http://localhost:5173 — Ctrl+C encerra os serviços.');
})();

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
