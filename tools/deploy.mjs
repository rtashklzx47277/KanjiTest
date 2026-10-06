import { runWorkflow } from './workflows.mjs';
const target = process.argv[2];
if (!['preview', 'production'].includes(target)) {
  console.error('Usage: node tools/deploy.mjs preview|production'); process.exitCode = 1;
} else {
  try {
    const result = await runWorkflow(target, '', { log: text => process.stdout.write(text) });
    console.log(`\n${result.message}\n${result.site}\n${result.deploymentUrl ?? ''}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
