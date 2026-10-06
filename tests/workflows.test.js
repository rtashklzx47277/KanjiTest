import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflow } from '../tools/workflows.mjs';
import { createToolboxServer } from '../tools/toolbox.mjs';

function fixture({ branch = 'codex/cloudflare-local-storage', fail, staged = true, previewOutput = false } = {}) {
  const calls = [];
  const run = async args => {
    calls.push(args);
    if (args[0] === 'git' && args[1] === 'branch') return { code:0, output:branch+'\n' };
    if (args[0] === 'git' && args[1] === 'diff') return { code:staged?1:0, output:'' };
    if (fail?.(args)) return { code:1, output:'failure' };
    return { code:0, output:args[0] === 'npx' ? 'Deployment complete! https://abc.kanjitest.pages.dev\n'+(previewOutput?'Deployment alias URL: https://preview.kanjitest.pages.dev':'') : 'ok' };
  };
  return { calls, run };
}
test('failed tests stop before build and publication', async () => {
  const f=fixture({fail:args=>args.includes('--test')});
  await assert.rejects(runWorkflow('preview','',f),/測試失敗/u);
  assert.equal(f.calls.some(args=>args.includes('tools/build.mjs')||args[0]==='npx'),false);
});
test('failed build prevents any deployment', async () => {
  const f=fixture({fail:args=>args.includes('tools/build.mjs')});
  await assert.rejects(runWorkflow('production','',f),/建置失敗/u);
  assert.equal(f.calls.some(args=>args[0]==='npx'),false);
});
test('production gate blocks feature branches before publication while preview remains available', async () => {
  const blocked=fixture({branch:'feature/new-ui'});
  await assert.rejects(runWorkflow('production','',blocked),/不能發布正式站/u);
  assert.equal(blocked.calls.length,1);
  const preview=fixture({branch:'feature/new-ui',previewOutput:true});
  const result=await runWorkflow('preview','',preview);
  assert.ok(preview.calls.at(-1).includes('--branch=preview'));
  assert.ok(preview.calls.at(-1).includes('--project-name=kanjitest'));
  assert.equal(result.site,'https://preview.kanjitest.pages.dev');
  assert.equal(result.deploymentUrl,'https://abc.kanjitest.pages.dev');
});
test('production checks and builds before explicitly targeting the production environment', async () => {
  const f=fixture({branch:'main'}),result=await runWorkflow('production','',f);
  assert.equal(f.calls[1][1],'--test');assert.equal(f.calls[2][1],'tools/build.mjs');
  assert.ok(f.calls[3].includes('--branch=main'));
  assert.equal(result.site,'https://kanjitest.pages.dev');
  assert.equal(f.calls.some(args=>args[0]==='git'&&args[1]!=='branch'),false);
});
test('successful CLI exit reporting a preview alias is not misreported as a production success', async () => {
  await assert.rejects(runWorkflow('production','',fixture({previewOutput:true})),/預覽網址/u);
});
test('commit messages are literal argv and a failed commit cannot push', async () => {
  const message='調整排版 "quoted" & echo nope',f=fixture();
  await runWorkflow('push',message,f);
  assert.deepEqual(f.calls.find(args=>args[1]==='commit'),['git','commit','-m',message]);
  assert.deepEqual(f.calls.at(-1),['git','push','-u','origin','codex/cloudflare-local-storage']);
  const failed=fixture({fail:args=>args[1]==='commit'});
  await assert.rejects(runWorkflow('push','change',failed),/提交失敗/u);
  assert.equal(failed.calls.some(args=>args[1]==='push'),false);
});
test('clean worktree still pushes existing unpushed commits, and blank messages do nothing', async () => {
  const f=fixture({staged:false});await runWorkflow('push','message',f);
  assert.equal(f.calls.some(args=>args[1]==='commit'),false);assert.equal(f.calls.at(-1)[1],'push');
  const blank=fixture();await assert.rejects(runWorkflow('push',' ',blank));assert.equal(blank.calls.length,0);
});
test('toolbox rejects off-origin requests, bad tokens and arbitrary actions without executing them', async t => {
  let executed=0;
  const server=createToolboxServer({inspect:async()=>({branch:'main',changes:''}),execute:async()=>{executed++;}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,html=await (await fetch(base)).text();
  const token=html.match(/name="toolbox-token" content="([^"]+)"/u)[1];
  const headers={'content-type':'application/json','x-toolbox-token':token};
  assert.equal((await fetch(base+'/api/run',{method:'POST',headers:{...headers,origin:'https://other.test'},body:'{"action":"production"}'})).status,403);
  assert.equal((await fetch(base+'/api/run',{method:'POST',headers:{...headers,'x-toolbox-token':'bad'},body:'{"action":"production"}'})).status,403);
  assert.equal((await fetch(base+'/api/run',{method:'POST',headers,body:'{"action":"delete-everything"}'})).status,400);
  assert.equal((await fetch(base+'/api/run',{method:'POST',headers,body:'{"action":"push","message":""}'})).status,400);
  assert.equal((await fetch(base+'/api/run',{method:'POST',headers,body:'no json'})).status,400);
  assert.equal(executed,0);
});
test('toolbox admits one job, exposes completion and allows another after failure', async t => {
  let release;
  const gate=new Promise(resolve=>release=resolve);
  const server=createToolboxServer({inspect:async()=>({branch:'main',changes:''}),execute:async()=>{await gate;throw new Error('測試失敗，未部署');},write:()=>{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,html=await (await fetch(base)).text();
  const headers={'content-type':'application/json','x-toolbox-token':html.match(/name="toolbox-token" content="([^"]+)"/u)[1]};
  const first=await fetch(base+'/api/run',{method:'POST',headers,body:'{"action":"preview"}'});assert.equal(first.status,202);
  const {jobId}=await first.json();
  assert.equal((await fetch(base+'/api/run',{method:'POST',headers,body:'{"action":"production"}'})).status,409);
  release();
  let job;
  for(let i=0;i<20;i++){job=await (await fetch(base+'/api/jobs/'+jobId)).json();if(job.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal(job.status,'failed');assert.match(job.result.message,/未部署/u);
  assert.equal((await (await fetch(base+'/api/status')).json()).activeJob,null);
  assert.equal((await fetch(base+'/api/run',{method:'POST',headers,body:'{"action":"verify"}'})).status,202);
});
