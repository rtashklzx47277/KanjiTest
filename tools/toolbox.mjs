import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { ACTIONS, deployment, ROOT, runCommand, runWorkflow } from './workflows.mjs';

const files = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./toolbox/index.html', import.meta.url), 'utf8')]],
  ['/toolbox.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./toolbox/app.js', import.meta.url), 'utf8')]],
  ['/toolbox.css', ['text/css; charset=utf-8', readFileSync(new URL('./toolbox/style.css', import.meta.url), 'utf8')]],
]);
async function inspectGit() {
  const results = await Promise.all([
    runCommand(['git', 'branch', '--show-current']), runCommand(['git', 'status', '--short']),
  ]);
  if (results.some(result => result.code !== 0)) throw new Error('無法讀取 Git 狀態，請確認 Git 與專案目錄。');
  return { branch: results[0].output.trim(), changes: results[1].output.trim() };
}

// The maintainer tool only listens on loopback. POSTs require a per-process token
// and same-origin JSON; no arbitrary commands, filesystem paths or secrets are accepted.
export function createToolboxServer({ execute = runWorkflow, inspect = inspectGit, write = text => process.stdout.write(text) } = {}) {
  const token = randomUUID(), jobs = new Map();
  let activeJob = null;
  const server = http.createServer(async (request, response) => {
    const port = server.address().port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const host = request.headers.host;
    const send = (status, body) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(JSON.stringify(body)); };
    if (!allowedHosts.includes(host) || (request.headers.origin && request.headers.origin !== `http://${host}`)) return send(403, { error: '此工具箱只接受本機同來源操作。' });
    const path = new URL(request.url, `http://${host}`).pathname;
    try {
      if (request.method === 'GET' && files.has(path)) {
        const [type, content] = files.get(path);
        response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
        return response.end(path === '/' ? content.replace('{{TOKEN}}', token) : content);
      }
      if (request.method === 'GET' && path === '/api/status') return send(200, { ...(await inspect()), root: ROOT, project: deployment.projectName, allowedProductionBranches: deployment.allowedProductionGitBranches, activeJob: activeJob?.id ?? null });
      if (request.method === 'GET' && /^\/api\/jobs\/[a-zA-Z0-9-]+$/u.test(path)) {
        const job = jobs.get(path.split('/').at(-1));
        return job ? send(200, job) : send(404, { error: '找不到執行紀錄。' });
      }
      if (request.method !== 'POST' || path !== '/api/run') return send(404, { error: '找不到此操作。' });
      if (request.headers['x-toolbox-token'] !== token || request.headers['content-type']?.split(';')[0] !== 'application/json') return send(403, { error: '請由工具箱頁面執行操作。' });
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 8192) return send(413, { error: '操作內容過長。' }); chunks.push(chunk); }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: '操作內容格式不正確。' }); }
      if (!ACTIONS.includes(input?.action) || (input.action === 'push' && (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 500 || input.message.includes('\0')))) return send(400, { error: '請選擇有效操作，提交時需填寫訊息。' });
      if (activeJob) return send(409, { error: '目前有工作執行中，請等候完成。', jobId: activeJob.id });
      const job = { id: randomUUID(), action: input.action, status: 'running', log: '', result: null, startedAt: new Date().toISOString() };
      jobs.set(job.id, job); activeJob = job;
      while (jobs.size > 10) jobs.delete(jobs.keys().next().value);
      send(202, { jobId: job.id });
      const log = text => { job.log = (job.log + text.replace(/\x1b\[[0-9;]*m/gu, '')).slice(-150000); write(text); };
      Promise.resolve().then(() => execute(input.action, input.message ?? '', { log })).then(result => {
        job.status = 'success'; job.result = result;
      }).catch(error => { job.status = 'failed'; job.result = { message: error.message }; log(`\nERROR ${error.message}\n`); }).finally(() => { job.finishedAt = new Date().toISOString(); activeJob = null; });
    } catch (error) { if (!response.headersSent) send(500, { error: error.message }); }
  });
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const portArg = process.argv.slice(2).find(arg => arg.startsWith('--port='));
  const port = Number(portArg?.slice(7) ?? 8025);
  if (Number(process.versions.node.split('.')[0]) < 22 || !Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('需要 Node.js 22 或以上；port 須為 1024–65535。'); process.exitCode = 1;
  } else {
    const server = createToolboxServer();
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} 已使用，請以 --port=其他埠號啟動。` : error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`KanjiTest 工具箱：${url}\n專案：${ROOT}\n關閉此視窗或按 Ctrl+C 結束工具箱。`);
      if (!process.argv.includes('--no-open')) {
        const args = process.platform === 'win32' ? ['cmd.exe', '/d', '/c', 'start', '', url] : process.platform === 'darwin' ? ['open', url] : ['xdg-open', url];
        const browser = spawn(args[0], args.slice(1), { windowsHide: true, stdio: 'ignore' });
        browser.on('error', () => console.log(`請自行開啟 ${url}`));
      }
    });
  }
}
