import { describe, expect, it } from "vitest";
import { resolveProfileIdentity, type ServerUser } from "../profile-identity";
import { adminNavigation, isNavigationActive } from "../admin-navigation";

const server: NonNullable<ServerUser> = {
  id: "user_a", name: "Server Name", email: "previous@example.invalid", imageUrl: "old.png", role: "admin",
};
const live = {
  id: "user_a", firstName: "Current", lastName: "Name", primaryEmailAddress: { emailAddress: "current@example.invalid" },
  imageUrl: "current.png", publicMetadata: { role: "student" },
};

describe("Navigation identity without cached auth state", () => {
  it("uses the identified server snapshot while Clerk initializes", () => {
    expect(resolveProfileIdentity(false, undefined, server)).toEqual(server);
    expect(resolveProfileIdentity(false, undefined, null)).toBeNull();
  });
  it("clears the server snapshot after a resolved sign-out", () => {
    expect(resolveProfileIdentity(true, live, server)?.name).toBe("Current Name");
    expect(resolveProfileIdentity(true, null, server)).toBeNull();
    expect(resolveProfileIdentity(true, undefined, server)).toBeNull();
  });
  it("uses current profile fields while retaining the same account's server role", () => {
    expect(resolveProfileIdentity(true, live, server)).toEqual({
      id: "user_a", name: "Current Name", email: "current@example.invalid", imageUrl: "current.png", role: "admin",
    });
  });
  it("never combines one account's name, email, image or role with another", () => {
    const changed = resolveProfileIdentity(true, { ...live, id: "user_b", firstName: null, lastName: null, primaryEmailAddress: null, imageUrl: "" }, server);
    expect(changed).toEqual({ id: "user_b", name: "User", email: "", imageUrl: "", role: "student" });
    expect(adminNavigation(changed?.role)).toEqual([]);
  });
  it("does not restore old profile fields when they are removed from the live account", () => {
    expect(resolveProfileIdentity(true, { ...live, firstName: null, lastName: null, primaryEmailAddress: null, imageUrl: "" }, server))
      .toMatchObject({ name: "User", email: "", imageUrl: "" });
  });
  it.each([undefined, null, {}, ["admin"], "administrator"])("treats unsupported metadata roles as student (%j)", role => {
    expect(resolveProfileIdentity(true, { ...live, id: "user_b", publicMetadata: { role } }, server)?.role).toBe("student");
  });
  it("does not mutate either Clerk data or the server snapshot", () => {
    const frozen = Object.freeze({ ...server });
    expect(resolveProfileIdentity(true, Object.freeze({ ...live }), frozen)?.name).toBe("Current Name");
    expect(frozen.name).toBe("Server Name");
  });
});

describe("Shared staff navigation", () => {
  it("keeps employee navigation limited to the queue and student directory", () => {
    expect(adminNavigation("employee").map(route => route.href)).toEqual(["/admin", "/admin/students"]);
  });
  it("includes the existing administrative workspaces in order", () => {
    expect(adminNavigation("admin").map(route => route.href)).toEqual([
      "/admin", "/admin/documents", "/admin/finance", "/admin/students", "/admin/settings",
    ]);
  });
  it.each(["student", undefined] as const)("shows no staff links for %s", role => {
    expect(adminNavigation(role)).toEqual([]);
  });
  it.each([
    ["/admin", "/admin", true],
    ["/admin/finance", "/admin", false],
    ["/admin/students/record", "/admin/students", true],
    ["/admin/students-extra", "/admin/students", false],
    ["/admin/notifications", "/admin/settings", true],
    ["/admin/notifications-extra", "/admin/settings", false],
    ["/admin/settings/email", "/admin/settings", true],
  ] as const)("matches route boundaries for %s against %s", (pathname, href, expected) => {
    expect(isNavigationActive(pathname, href)).toBe(expected);
  });
});
