import handler from "vinext/server/app-router-entry";

const productionHostname = "assinatura.maiocchi.adv.br";

interface Env {
  ASSETS?: {
    fetch(request: Request): Promise<Response> | Response;
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).hostname.toLowerCase() === productionHostname) {
      return new Response(null, {
        status: 421,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
      });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
