import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { loadStudentHistory } from "@/lib/student-request-data";
import { historyQuerySchema } from "@/lib/student-request-model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "private, no-store" } });
    }

    const params = new URL(request.url).searchParams;
    if (params.get("format") !== "history-v2") {
      return NextResponse.json({ error: "Refresh the dashboard to load the current request history." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    const page = params.get("page");
    const parsed = historyQuerySchema.safeParse({
      page: page === null ? undefined : /^\d{1,6}$/.test(page) ? Number(page) : NaN,
      sort: params.get("sort") ?? undefined, direction: params.get("direction") ?? undefined,
    });
    if (!parsed.success || ["page", "sort", "direction", "format"].some(key => params.getAll(key).length > 1)) {
      return NextResponse.json({ error: "Invalid history query." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await loadStudentHistory(user.id, parsed.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error fetching student requests:", { error: error instanceof Error ? error.name : "UnknownError" });
    return new NextResponse("Internal Server Error", { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
