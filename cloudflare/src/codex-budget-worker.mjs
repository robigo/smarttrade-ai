// Dedicated budget Worker entrypoint. No public route to the Durable Object.
// This file is not referenced by the existing Preview or Production deployments.
export {CodexBudget} from './codex-budget-do.mjs';
export default {
  async fetch() {
    return new Response(JSON.stringify({error:'not_found'}),{
      status:404,
      headers:{'content-type':'application/json','cache-control':'no-store'}
    });
  }
};
