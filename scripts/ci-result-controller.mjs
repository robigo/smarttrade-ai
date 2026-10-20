import {readFileSync,appendFileSync} from 'node:fs';

export function decideNextStep({conclusion, name, branch}) {
  if (branch !== 'preview/cloudflare-unified-v09') return {step:'ignore',reason:'not_preview'};
  if (!['SmartTrade Preview Deploy','SmartTrade Preview Checks','SmartTrade Preview UI Smoke Tests'].includes(name)) return {step:'ignore',reason:'unrelated'};
  if (conclusion !== 'success') return {step:'stop',reason:'workflow_'+(conclusion||'unknown')};
  return {step:'health',reason:'checks_passed'};
}

async function main() {
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const run=event.workflow_run || {
    name:process.env.INPUT_WORKFLOW_NAME,
    conclusion:process.env.INPUT_CONCLUSION,
    head_branch:process.env.INPUT_BRANCH
  };
  const decision=decideNextStep({conclusion:run.conclusion,name:run.name,branch:run.head_branch});
  const lines=['## SmartTrade CI result controller',
    '- Workflow: '+run.name,
    '- Conclusion: '+run.conclusion,
    '- Decision: '+decision.step+' ('+decision.reason+')'];
  if(decision.step==='health'){
    let ok=false;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const res=await fetch('https://smarttrade-ai-preview.goshen-r.workers.dev/health',{signal:AbortSignal.timeout(8000),cache:'no-store'});
        const body=await res.json();
        if(res.ok&&body.status==='ok'&&body.service==='smarttrade-ai-preview'){ok=true;break}
      }catch{}
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1500));
    }
    lines.push('- Public Preview health: '+(ok?'PASS':'FAIL'));
    lines.push('- Next step: '+(ok?'Ready for further isolated UI verification':'Stop and investigate connectivity/health'));
    if(!ok){if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');process.exitCode=1;return}
  }else if(decision.step==='stop'){
    lines.push('- Next step: Stop progression; inspect failed job logs. No automatic changes.');
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
    process.exitCode=1;return;
  }
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
  console.log(lines.join('\n'));
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)await main();
