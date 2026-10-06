import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const deployment = JSON.parse(readFileSync(new URL('./deployment.json', import.meta.url), 'utf8'));
export const ACTIONS = ['verify', 'preview', 'production', 'push'];
const safeName = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/u.test(value);
if (![deployment.projectName, deployment.productionBranch, deployment.previewBranch, ...deployment.allowedProductionGitBranches].every(safeName)
  || deployment.productionBranch === deployment.previewBranch) throw new Error('部署設定不正確。');

// npm/npx are .cmd on Windows. Only fixed, validated arguments use that shell;
// Git commit messages always travel as argv to git.exe, never as shell text.
export function runCommand(args, log = () => {}) {
  return new Promise((resolve, reject) => {
    const [command, ...parameters] = args;
    const useShell = process.platform === 'win32' && ['npm', 'npx'].includes(command);
    const child = spawn(command, parameters, {
      cwd: ROOT, shell: useShell, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0' },
    });
    let output = '';
    const append = chunk => { output += chunk; log(chunk); };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.on('error', reject);
    child.on('close', code => resolve({ code, output }));
  });
}

export async function runWorkflow(action, message = '', { run = runCommand, log = () => {} } = {}) {
  if (!ACTIONS.includes(action)) throw new Error('未知的工具箱操作。');
  if (action === 'push' && (typeof message !== 'string' || !message.trim() || message.length > 500 || message.includes('\0'))) throw new Error('請填寫 1–500 字的提交訊息。');
  const execute = async (label, args) => {
    log(`\n==> ${label}\n`);
    const result = await run(args, log);
    if (result.code !== 0) throw new Error(`${label}失敗（exit ${result.code}）。請查看執行紀錄。`);
    return result.output;
  };
  let branch;
  if (action !== 'verify') {
    branch = (await execute('檢查目前 Git 分支', ['git', 'branch', '--show-current'])).trim();
    if (!branch) throw new Error('目前是 detached HEAD，請先切換到要使用的 Git 分支。');
    if (action === 'production' && !deployment.allowedProductionGitBranches.includes(branch)) throw new Error(`此分支不能發布正式站：${branch}。允許分支見 tools/deployment.json。`);
  }
  if (action === 'push') {
    await execute('暫存本專案變更', ['git', 'add', '-A']);
    const diff = await run(['git', 'diff', '--cached', '--quiet'], log);
    if (diff.code === 1) await execute('提交', ['git', 'commit', '-m', message.trim()]);
    else if (diff.code !== 0) throw new Error('無法檢查暫存變更。');
    else log('沒有新變更，略過提交；仍推送尚未發布的提交。\n');
    await execute('推送目前分支', ['git', 'push', '-u', 'origin', branch]);
    return { message: `已推送 ${branch}；網站發布請另按部署按鈕。`, branch };
  }
  await execute('測試', [process.execPath, '--test']);
  await execute('建置', [process.execPath, 'tools/build.mjs']);
  if (action === 'verify') return { message: '測試與建置全部通過。' };
  const target = action === 'production' ? deployment.productionBranch : deployment.previewBranch;
  const output = await execute(action === 'production' ? '部署正式版' : '部署預覽版', ['npx', '--yes', 'wrangler@4', 'pages', 'deploy', 'dist', `--project-name=${deployment.projectName}`, `--branch=${target}`]);
  if (action === 'production' && /Deployment alias URL:/u.test(output)) throw new Error('Wrangler 回報分支預覽網址，請核對正式環境設定與上傳紀錄。');
  const match = output.match(/Deployment complete![\s\S]*?(https:\/\/[a-zA-Z0-9.-]+\.pages\.dev)/u);
  const site = action === 'production' ? `https://${deployment.projectName}.pages.dev` : `https://${target}.${deployment.projectName}.pages.dev`;
  return { message: action === 'production' ? '正式版已部署。' : '預覽版已部署。', site, deploymentUrl: match?.[1] ?? null, branch };
}
