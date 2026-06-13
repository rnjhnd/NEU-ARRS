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
  const DEFAULT_TEMPLATES: Record<string, string> = {
    PENDING_PAYMENT: "We have successfully received your document request. Please complete your payment via PayMongo to proceed with processing.",
    PENDING: "Your payment has been verified. Your document request is now pending review by the Registrar's Office.",
    PROCESSING: "We are currently processing your document. Please allow 3-5 business days for completion.",
    READY_FOR_PICKUP: "Great news! Your document is printed and ready for pickup. Please proceed to the Registrar's Office at Window 4 between 8:00 AM and 5:00 PM (Monday-Friday). Don't forget to bring your valid Student ID.",
    COMPLETED: "Your document request has been successfully completed and claimed. Thank you for using the NEU Academic Record Request System!",
    CANCELLED: "Your document request has been cancelled. If you believe this is an error, please contact the Registrar's Office."
  };

  try {
    let customMessage: string | undefined = DEFAULT_TEMPLATES[status];

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

export async function sendCorrectionEmail(
  to: string,
  studentName: string,
  documentType: string,
  status: string,
) {
  try {
    const customMessage = `There has been an administrative update to your request. Please note that the current true status of your document is actually: ${status.replace(/_/g, " ")}. We apologize for any confusion caused by our previous automated message.`;

    const data = await resend.emails.send({
      from: 'Registrar <onboarding@resend.dev>',
      to: [to],
      subject: `Correction: Document Request Update - ${documentType.replace("_", " ")}`,
      react: StatusUpdateEmail({
        studentName,
        documentType: documentType.replace("_", " "),
        status,
        customMessage,
      }),
    });

    return { success: true, data };
  } catch (error) {
    console.error("Failed to send correction email", error);
    return { success: false, error };
  }
}
