import { Resend } from 'resend';
import { StatusUpdateEmail } from '@/emails/status-update-email';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendStatusUpdateEmail(
  to: string,
  studentName: string,
  documentType: string,
  status: string,
  cancelReason?: string | null
) {
  try {
    const data = await resend.emails.send({
      from: 'Registrar <onboarding@resend.dev>',
      to: [to],
      subject: `Document Request Update: ${documentType.replace("_", " ")}`,
      react: StatusUpdateEmail({
        studentName,
        documentType: documentType.replace("_", " "),
        status,
        cancelReason,
      }),
    });

    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email", error);
    return { success: false, error };
  }
}
