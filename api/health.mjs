// Health check for uptime monitoring (Better Stack). Returns 200 when the site can do its job and 503 when it can't.
// dapload.com is a static site: the live demo runs in the browser against a mock, and the real app runs on users' own
// machines. So there are no checks, and a 200 proves the deployment is live and serves functions. Left out: Vercel Web
// Analytics (an outage only loses data) and GitHub/ghcr.io (install instructions point there, but the site still works
// and we can't fix them). New checks go in `checks` as { ok, ms } with a 3-second timeout, and must never throw.
// The body has no error details, since the URL is public.

/** @returns {Promise<Response>} */
export async function GET() {
  /** @type {Record<string, { ok: boolean, ms: number }>} */
  const checks = {};
  const ok = Object.values(checks).every((c) => c.ok);
  return Response.json(
    { ok, checks, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local' },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
