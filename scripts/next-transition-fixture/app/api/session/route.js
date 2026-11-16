import { fixtureActor } from "../../../server-data";
export async function GET() {
  const access = await fixtureActor();
  return Response.json(access ? { userId: access.userId, role: access.role } : { error: "Synthetic session ended" }, { status: access ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
