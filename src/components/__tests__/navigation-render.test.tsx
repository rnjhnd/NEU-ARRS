import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileMenu } from "../profile-menu";
import { ProfileDetails } from "../profile-details";
import { ThemeToggle } from "../theme-toggle";
import { AdminNavLinks } from "@/app/(admin)/admin-nav-links";
import { MobileNav } from "@/app/(admin)/mobile-nav";
import type { ServerUser } from "@/lib/profile-identity";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), signOut: vi.fn(), pathname: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useUser: mocks.auth, useClerk: () => ({ signOut: mocks.signOut }) }));
vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));

const server: NonNullable<ServerUser> = { id: "user_a", name: "Previous Person", email: "previous@example.invalid", imageUrl: "", role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ isLoaded: false, user: undefined });
  mocks.pathname.mockReturnValue("/admin");
});

describe("Navigation server rendering and accessible names", () => {
  it("renders bootstrap identity without a browser document or provider requests", () => {
    expect(renderToStaticMarkup(<ProfileMenu serverUser={server} />)).toContain('aria-label="Open profile menu for Previous Person"');
    expect(renderToStaticMarkup(<ProfileDetails serverUser={server} />)).toContain("Previous Person");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("removes the menu and adjacent labels when Clerk resolves signed out", () => {
    mocks.auth.mockReturnValue({ isLoaded: true, user: null });
    expect(renderToStaticMarkup(<ProfileMenu serverUser={server} />)).toBe("");
    expect(renderToStaticMarkup(<ProfileDetails serverUser={server} />)).toBe("");
    expect(renderToStaticMarkup(<MobileNav serverUser={server} />)).not.toContain("Previous Person");
  });
  it("escapes live names and never displays another account's bootstrap identity", () => {
    mocks.auth.mockReturnValue({ isLoaded: true, user: {
      id: "user_b", firstName: "<script>", lastName: "Current", primaryEmailAddress: null, imageUrl: "", publicMetadata: {},
    } });
    const html = renderToStaticMarkup(<ProfileDetails serverUser={server} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Previous Person"); expect(html).not.toContain("Administrator");
  });
  it("renders a labelled, closed mobile trigger without accessing document.body", () => {
    const html = renderToStaticMarkup(<MobileNav serverUser={server} />);
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
  });
  it("preserves accessible route names when the sidebar is collapsed", () => {
    mocks.pathname.mockReturnValue("/admin/notifications");
    const html = renderToStaticMarkup(<AdminNavLinks role="admin" collapsed />);
    expect(html).toContain('class="sr-only">System Settings</span>');
    const currentLink = html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(currentLink).toContain('href="/admin/settings"');
    expect((html.match(/aria-current="page"/g) ?? [])).toHaveLength(1);
  });
  it("omits admin-only links in the employee menu", () => {
    const html = renderToStaticMarkup(<AdminNavLinks role="employee" />);
    expect(html).toContain('href="/admin/students"');
    expect(html).not.toContain('href="/admin/finance"');
    expect(html).not.toContain('href="/admin/settings"');
  });
  it("renders the theme button identically without waiting for a mount effect", () => {
    expect(renderToStaticMarkup(<ThemeToggle />)).toContain('aria-label="Toggle theme"');
  });
});
