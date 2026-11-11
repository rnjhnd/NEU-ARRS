import { NextResponse } from "next/server";
import { DirectoryLoadError, loadStudentDirectory, requireDirectoryActor } from "@/lib/student-directory-data";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await requireDirectoryActor();
    const params = new URL(request.url).searchParams;
    if (params.get("format") !== "directory-v1") return NextResponse.json({ error: "Reload the student directory." }, { status: 409, headers });
    if (params.getAll("format").length !== 1 || [...params.keys()].some(key => key !== "format")) return NextResponse.json({ error: "Invalid directory request." }, { status: 400, headers });
    return NextResponse.json(await loadStudentDirectory(), { headers });
  } catch (error) {
    const status = error instanceof DirectoryLoadError ? error.status : 500;
    if (status === 500) console.error("[DIRECTORY_GET]", { error: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: error instanceof DirectoryLoadError ? error.message : "Student directory unavailable." }, { status, headers });
  }
}
