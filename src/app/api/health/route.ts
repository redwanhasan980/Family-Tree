// Public liveness check for the Docker health check, the deploy script and uptime monitors.
// It exposes no user data, so it is the one Route Handler without verifyRequest().
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok', version: process.env.APP_VERSION ?? 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
