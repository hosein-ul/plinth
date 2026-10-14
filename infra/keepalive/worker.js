export default {
  async scheduled(_event, env) {
    const started = Date.now();
    try {
      const res = await fetch(env.TARGET, { headers: { "user-agent": "plinth-keepalive" } });
      console.log(`ping ${res.status} in ${Date.now() - started}ms`);
    } catch (err) {
      console.log(`ping failed: ${err instanceof Error ? err.message : err}`);
    }
  },
  async fetch() {
    return new Response("plinth-keepalive: runs on a schedule only", { status: 404 });
  },
};
