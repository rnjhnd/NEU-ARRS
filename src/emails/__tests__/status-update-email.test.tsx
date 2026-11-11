import { describe, expect, it } from "vitest";
import { render, toPlainText } from "@react-email/render";
import { render as renderFromComponents } from "@react-email/components";
import { StatusUpdateEmail } from "../status-update-email";

describe("Updated email rendering dependency compatibility", () => {
  it("renders the existing Tailwind email through both renderer entry points", async () => {
    const email = <StatusUpdateEmail studentName="Synthetic Student" documentType="Transcript of Records" status="READY_FOR_PICKUP" customMessage="Your document is ready." />;
    const html = await render(email);
    expect(html).toContain("Synthetic Student");
    expect(html).toContain("READY FOR PICKUP");
    expect(html).toContain("Your document is ready.");
    expect(html).toContain("https://neu-arrs.vercel.app/dashboard");
    expect(await renderFromComponents(email)).toContain("Your document is ready.");
    expect(toPlainText(html)).toContain("Transcript of Records");
  });

  it("keeps student names, cancellation reasons, and custom messages as escaped text", async () => {
    const html = await render(<StatusUpdateEmail
      studentName={'<script>alert("name")</script>'}
      documentType="TOR"
      status="CANCELLED"
      cancelReason={'<img src=x onerror="alert(1)">'}
      customMessage={'<a href="javascript:alert(1)">message</a>'}
    />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;a");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('<a href="javascript:');
  });
});
