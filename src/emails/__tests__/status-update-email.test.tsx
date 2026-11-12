import { describe, expect, it } from "vitest";
import { render, toPlainText } from "@react-email/render";
import { StatusUpdateEmail } from "../status-update-email";

describe("Maintained renderer with native email markup", () => {
  it("renders an accessible email with the configured portal and plain text alternative", async () => {
    const email = <StatusUpdateEmail studentName="Synthetic Student" documentType="Transcript of Records" status="READY_FOR_PICKUP" customMessage="Your document is ready." appUrl="https://app.example.invalid" />;
    const html = await render(email);
    expect(html).toContain("Synthetic Student");
    expect(html).toContain("READY FOR PICKUP");
    expect(html).toContain("Your document is ready.");
    expect(html).toContain("https://app.example.invalid/dashboard");
    expect(html).toContain('lang="en"');
    expect(html).not.toMatch(/fonts\.(gstatic|googleapis)|raw\.githubusercontent|class=/);
    expect(toPlainText(html)).toContain("Transcript of Records");
  });

  it("keeps student names, cancellation reasons, and custom messages as escaped text", async () => {
    const html = await render(<StatusUpdateEmail
      studentName={'<script>alert("name")</script>'}
      documentType="TOR"
      status="CANCELLED"
      cancelReason={'<img src=x onerror="alert(1)">'}
      customMessage={'<a href="javascript:alert(1)">message</a>'}
      appUrl="https://app.example.invalid"
    />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;a");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('<a href="javascript:');
  });
  it.each(["http://example.invalid", "javascript:alert(1)", "https://user:password@example.invalid"])("rejects unsafe portal configuration (%s)", async appUrl => {
    expect(() => StatusUpdateEmail({ studentName: "Synthetic", documentType: "TOR", status: "PROCESSING", appUrl })).toThrow();
  });
  it.each(["PENDING_PAYMENT", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"])("renders plain text status and multiline content for %s", async status => {
    const html = await render(<StatusUpdateEmail studentName="Synthetic" documentType="TOR" status={status} customMessage={"First line\nSecond line"} appUrl="https://app.example.invalid/path?ignored=yes" />);
    expect(toPlainText(html)).toContain(status.replace(/_/g, " "));
    expect(html).toContain("First line\nSecond line"); expect(html).toContain("https://app.example.invalid/dashboard");
  });
});
