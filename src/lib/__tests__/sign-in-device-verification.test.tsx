import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";

const mocks = vi.hoisted(() => ({ signIn: { status: "needs_client_trust", supportedSecondFactors: [{ strategy: "email_code" }], mfa: { sendEmailCode: vi.fn(), verifyEmailCode: vi.fn() }, finalize: vi.fn(), reset: vi.fn() } }));
vi.mock("@clerk/nextjs", () => ({ useSignIn: () => ({ signIn: mocks.signIn }), useClerk: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signIn.status = "needs_client_trust";
  mocks.signIn.supportedSecondFactors = [{ strategy: "email_code" }];
});

describe("Device verification sign-in rendering", () => {
  it("shows a labelled one-time-code form without alternate credentials while device verification is pending", () => {
    const html = renderToStaticMarkup(<SignInPage />);
    expect(html).toContain("Verify this device");
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain('for="deviceCode"');
    expect(html).not.toContain('id="password"');
    expect(html).not.toContain("Continue with Google");
    expect(html).toContain("Verify and sign in");
    expect(mocks.signIn.mfa.sendEmailCode).not.toHaveBeenCalled();
    expect(mocks.signIn.finalize).not.toHaveBeenCalled();
  });
  it("keeps the password flow for ordinary sign-in", () => {
    mocks.signIn.status = "needs_identifier";
    const html = renderToStaticMarkup(<SignInPage />);
    expect(html).toContain('id="password"');
    expect(html).not.toContain('id="deviceCode"');
  });
  it("does not substitute email verification for an unsupported factor or user-enabled MFA", () => {
    mocks.signIn.supportedSecondFactors = [{ strategy: "totp" }];
    expect(renderToStaticMarkup(<SignInPage />)).not.toContain('id="deviceCode"');
    mocks.signIn.supportedSecondFactors = [{ strategy: "email_code" }];
    mocks.signIn.status = "needs_second_factor";
    expect(renderToStaticMarkup(<SignInPage />)).not.toContain('id="deviceCode"');
    expect(mocks.signIn.finalize).not.toHaveBeenCalled();
  });
});
