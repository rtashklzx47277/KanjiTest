import { runWorkflow } from './workflows.mjs';
try {
  await runWorkflow('verify', '', { log: text => process.stdout.write(text) });
} catch (error) { console.error(error.message); process.exitCode = 1; }
