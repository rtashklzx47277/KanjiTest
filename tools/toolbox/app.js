const $ = selector => document.querySelector(selector);
const token = $('meta[name=toolbox-token]').content;
let busy = false, permitted = false;
function buttons() { for (const button of document.querySelectorAll('[data-action]')) button.disabled = busy || (button.dataset.action === 'production' && !permitted); }
async function json(url, options) {
  const response = await fetch(url, options), body = await response.json();
  if (!response.ok) throw new Error(body.error || '操作失敗。');
  return body;
}
async function metadata() {
  const data = await json('/api/status');
  $('#branch').textContent = data.branch || 'detached HEAD'; $('#project').textContent = data.project;
  $('#root').textContent = data.root; $('#changes').textContent = data.changes || '工作區沒有尚未提交的變更。';
  permitted = data.allowedProductionBranches.includes(data.branch);
  $('#branch-note').textContent = permitted ? `發布來源：${data.branch}` : '此分支僅能部署預覽版。正式發布的允許分支見 tools/deployment.json。';
  buttons();
  if (data.activeJob) { busy = true; buttons(); poll(data.activeJob); }
}
function links(result) {
  $('#links').replaceChildren();
  for (const [label, href] of [['開啟網站', result.site], ['開啟本次部署', result.deploymentUrl]]) {
    if (!href) continue;
    const url = new URL(href); if (url.protocol !== 'https:' || !url.hostname.endsWith('.pages.dev')) continue;
    const link = document.createElement('a'); link.href = url.href; link.textContent = label; link.target = '_blank'; link.rel = 'noopener'; $('#links').append(link);
  }
}
async function poll(id) {
  try {
    const job = await json('/api/jobs/' + id), log = $('#log');
    const nearEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
    log.textContent = job.log || '準備執行…'; if (nearEnd) log.scrollTop = log.scrollHeight;
    $('#state').dataset.status = job.status; $('#state').textContent = { running: '執行中', success: '已完成', failed: '失敗' }[job.status];
    if (job.status === 'running') { setTimeout(() => poll(id), 700); return; }
    $('#result').textContent = job.result.message; links(job.result); busy = false; buttons();
    await metadata().catch(error => { permitted = false; $('#branch').textContent = 'Git 狀態無法讀取'; $('#branch-note').textContent = error.message; buttons(); });
  } catch (error) { $('#result').textContent = error.message; $('#state').textContent = '連線中斷，重新整理可查看目前工作。'; busy = true; buttons(); }
}
for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', async () => {
  if (busy) return;
  const message = $('#commit-message').value.trim();
  if (button.dataset.action === 'push' && !message) { $('#commit-message').focus(); $('#result').textContent = '請填寫提交訊息。'; return; }
  busy = true; buttons(); $('#links').replaceChildren(); $('#result').textContent = ''; $('#state').textContent = '準備執行'; $('#state').dataset.status = 'running';
  try {
    const result = await json('/api/run', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox-token': token }, body: JSON.stringify({ action: button.dataset.action, message }) });
    $('.execution').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await poll(result.jobId);
  } catch (error) { busy = false; buttons(); $('#result').textContent = error.message; $('#state').textContent = '未啟動'; $('#state').dataset.status = 'failed'; await metadata().catch(() => {}); }
});
buttons(); metadata().catch(error => { $('#result').textContent = error.message; });
