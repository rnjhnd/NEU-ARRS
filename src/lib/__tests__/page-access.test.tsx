import { beforeEach, expect, it, vi } from "vitest";
import { auth } from "@clerk/nextjs/server";
import { AccessError, getVerifiedActor } from "@/lib/auth";
import { requirePageAccess } from "../page-access";
import { withVerifiedPage } from "@/components/verified-page";
import { SessionPage } from "@/components/session-guard";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getVerifiedActor).mockResolvedValue({ userId: "student", role: "student" });
  vi.mocked(auth).mockResolvedValue({ userId: "student", sessionId: "session_student" } as Awaited<ReturnType<typeof auth>>);
});

it("serializes only the authorized account, role and matching session identifier", async () => {
  expect(await requirePageAccess(["student"])).toEqual({ userId: "student", role: "student", sessionId: "session_student" });
});
it.each([null, "employee", "admin"] as const)("does not admit a student to an unapproved role set (%s)", async role => {
  const render = vi.fn(async () => "private page");
  const page = withVerifiedPage(render, role ? [role] : []);
  await expect(page()).rejects.toMatchObject({ status: 403 });
  expect(render).not.toHaveBeenCalled();
});
it.each([{ userId: "another", sessionId: "session_student" }, { userId: "student", sessionId: null }])("rejects an inconsistent request binding before loading data (%j)", async context => {
  vi.mocked(auth).mockResolvedValue(context as Awaited<ReturnType<typeof auth>>);
  const render = vi.fn(async () => "private page");
  await expect(withVerifiedPage(render, ["student"])()).rejects.toMatchObject({ status: 401 });
  expect(render).not.toHaveBeenCalled();
});
it.each([401, 403, 503] as const)("propagates session verification failure %s before loading the page", async status => {
  vi.mocked(getVerifiedActor).mockRejectedValue(new AccessError(status));
  const render = vi.fn(async () => "private page");
  await expect(withVerifiedPage(render, ["student"])()).rejects.toMatchObject({ status });
  expect(render).not.toHaveBeenCalled();
  expect(auth).not.toHaveBeenCalled();
});
it("keeps page props and the server-authorized result together", async () => {
  const render = vi.fn(async ({ id }: { id: string }) => "private " + id);
  const element = await withVerifiedPage(render, ["student"])({ id: "record" });
  expect(render).toHaveBeenCalledWith({ id: "record" });
  expect(element.type).toBe(SessionPage);
  expect(element.props).toEqual({ access: { userId: "student", role: "student", sessionId: "session_student" }, children: "private record" });
});
