import * as React from "react";

interface StatusUpdateEmailProps {
  studentName: string;
  documentType: string;
  status: string;
  cancelReason?: string | null;
  customMessage?: string;
  appUrl: string;
}
const text: React.CSSProperties = { color: "#334155", fontSize: 15, lineHeight: "24px", margin: "0 0 20px" };
function statusPalette(status: string) {
  if (["READY_FOR_PICKUP", "COMPLETED"].includes(status)) return { background: "#ecfdf5", color: "#065f46", border: "#10b981" };
  if (status === "CANCELLED") return { background: "#fef2f2", color: "#991b1b", border: "#ef4444" };
  if (["PENDING_PAYMENT", "PENDING", "PROCESSING"].includes(status)) return { background: "#fffbeb", color: "#92400e", border: "#eab308" };
  return { background: "#f8fafc", color: "#334155", border: "#64748b" };
}

/** Plain React email markup: text stays escaped; no CSS compiler or remote fonts. */
export function StatusUpdateEmail({ studentName, documentType, status, cancelReason, customMessage, appUrl }: StatusUpdateEmailProps) {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Email requires an HTTPS application origin.");
  const portal = new URL("/dashboard", url.origin).href;
  const palette = statusPalette(status);
  const readableStatus = status.replace(/_/g, " ");
  // eslint-disable-next-line @next/next/no-head-element -- Standalone email HTML is rendered outside Next.js document routing.
  return <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Document Status Update</title></head>
    <body style={{ backgroundColor: "#f6f9fc", margin: 0, padding: "24px 12px", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>Update on your {documentType} request: {readableStatus}</div>
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ maxWidth: 480, margin: "0 auto", backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, overflowWrap: "anywhere" }}><tbody>
        <tr><td style={{ backgroundColor: "#022c22", padding: "28px 24px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#ffffff", letterSpacing: 1 }}>NEU-ARRS</p>
          <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: "18px", color: "#cbd5e1", textTransform: "uppercase" }}>Academic Record Request System</p>
        </td></tr>
        <tr><td style={{ padding: "28px 24px 12px" }}>
          <h1 style={{ color: "#0f172a", fontSize: 22, lineHeight: "30px", margin: "0 0 24px", textAlign: "center" }}>Document Status Update</h1>
          <p style={text}>Hello <strong>{studentName}</strong>,</p>
          <p style={text}>There is an update regarding your request for your <strong>{documentType}</strong>.</p>
          <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ backgroundColor: palette.background, border: `1px solid ${palette.border}`, borderRadius: 8, marginBottom: 24 }}><tbody><tr><td style={{ padding: 16, textAlign: "center" }}>
            <p style={{ color: palette.color, fontSize: 16, fontWeight: 700, margin: 0 }}>Status: {readableStatus}</p>
            {cancelReason && <p style={{ color: "#991b1b", fontSize: 14, lineHeight: "22px", whiteSpace: "pre-wrap", margin: "8px 0 0" }}>Reason: {cancelReason}</p>}
          </td></tr></tbody></table>
          {customMessage && <p style={{ ...text, backgroundColor: palette.background, color: palette.color, borderLeft: `4px solid ${palette.border}`, padding: "16px 18px", whiteSpace: "pre-wrap" }}>{customMessage}</p>}
          <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "28px auto" }}><tbody><tr><td style={{ backgroundColor: "#059669", borderRadius: 6, padding: "12px 24px", textAlign: "center" }}><a href={portal} style={{ color: "#ffffff", fontSize: 15, fontWeight: 700, lineHeight: "24px", textDecoration: "none" }}>View Request Portal</a></td></tr></tbody></table>
        </td></tr>
        <tr><td style={{ padding: "0 24px 28px" }}><hr style={{ border: 0, borderTop: "1px solid #e5e7eb", margin: "0 0 20px" }} />
          <p style={{ ...text, fontSize: 13 }}>Respectfully,<br /><strong>Office of the University Registrar</strong><br />New Era University</p>
          <p style={{ ...text, fontSize: 12, color: "#64748b", lineHeight: "20px" }}>For inquiries, please contact <a href="mailto:registrar@neu.edu.ph" style={{ color: "#059669" }}>registrar@neu.edu.ph</a>.<br />Copyright {new Date().getFullYear()} New Era University. All rights reserved.</p>
          <p style={{ ...text, fontSize: 11, color: "#64748b", lineHeight: "18px", marginBottom: 0 }}>This email was intended for {studentName}. If you did not request this document, please ignore this email.</p>
        </td></tr>
      </tbody></table>
    </body></html>;
}
