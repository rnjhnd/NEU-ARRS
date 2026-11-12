import { AccessError, getVerifiedActor } from "@/lib/auth";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { return Response.json(await getVerifiedActor(), { headers }); }
  catch (error) { return Response.json({ error: "Session access could not be verified." }, { status: error instanceof AccessError ? error.status : 503, headers }); }
}
