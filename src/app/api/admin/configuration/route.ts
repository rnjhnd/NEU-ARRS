import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ConfigurationReadError, loadAdminDocuments, loadAdminSettings } from "@/lib/configuration-data";
import { loadRoleAccounts } from "@/lib/configuration-roles";
import { AccountSnapshotError } from "@/lib/clerk-account-snapshot";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await requireAdmin(); const params = new URL(request.url).searchParams;
    if (params.get("format") !== "config-v1") return NextResponse.json({ error: "Reload configuration." }, { status: 409, headers });
    const area = params.get("area");
    if (!["documents", "settings", "roles"].includes(area ?? "") || ["format", "area"].some(key => params.getAll(key).length !== 1) || [...params.keys()].some(key => !["format", "area"].includes(key))) return NextResponse.json({ error: "Invalid configuration request." }, { status: 400, headers });
    return NextResponse.json(area === "documents" ? await loadAdminDocuments() : area === "settings" ? await loadAdminSettings() : await loadRoleAccounts(), { headers });
  } catch (error) {
    const auth = error instanceof Error && /^(Unauthorized|Forbidden)/.test(error.message);
    const status = auth ? (error.message.startsWith("Unauthorized") ? 401 : 403) : error instanceof AccountSnapshotError ? error.status : error instanceof ConfigurationReadError ? 413 : 500;
    return NextResponse.json({ error: auth ? "Administrator access required." : "The complete configuration is unavailable. Refresh before editing." }, { status, headers });
  }
}
