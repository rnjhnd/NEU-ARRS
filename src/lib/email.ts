import { Resend } from 'resend';
import { StatusUpdateEmail } from '@/emails/status-update-email';
import prisma from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key");

export async function sendStatusUpdateEmail(
  to: string,
  studentName: string,
  documentType: string,
  status: string,
  cancelReason?: string | null
) {
  try {
    let customMessage: string | undefined = undefined;

    try {
      const setting = await prisma.systemSettings.findUnique({
        where: { key: "EMAIL_TEMPLATES" }
      });
      if (setting && setting.value) {
        const templates = JSON.parse(setting.value);
        if (templates[status]) {
          customMessage = templates[status];
        }
      }
    } catch (dbError) {
      console.error("Failed to fetch email templates from db", dbError);
    }

    const data = await resend.emails.send({
      from: 'Registrar <onboarding@resend.dev>',
      to: [to],
      subject: `Document Request Update: ${documentType.replace("_", " ")}`,
      react: StatusUpdateEmail({
        studentName,
        documentType: documentType.replace("_", " "),
        status,
        cancelReason,
        customMessage,
      }),
    });

    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email", error);
    return { success: false, error };
  }
}
