import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
  Font,
} from '@react-email/components';
import * as React from 'react';

interface StatusUpdateEmailProps {
  studentName: string;
  documentType: string;
  status: string;
  cancelReason?: string | null;
  customMessage?: string;
}

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'PENDING_PAYMENT':
    case 'PENDING':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-500',
        msgBg: 'bg-amber-50/40',
      };
    case 'PROCESSING':
      return {
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-500',
        msgBg: 'bg-indigo-50/40',
      };
    case 'READY_FOR_PICKUP':
    case 'COMPLETED':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-500',
        msgBg: 'bg-emerald-50/40',
      };
    case 'CANCELLED':
      return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-500',
        msgBg: 'bg-red-50/40',
      };
    default:
      return {
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-500',
        msgBg: 'bg-slate-50/40',
      };
  }
};

export const StatusUpdateEmail = ({
  studentName = 'Student',
  documentType = 'Document',
  status = 'PROCESSING',
  cancelReason,
  customMessage,
}: StatusUpdateEmailProps) => {
  const styles = getStatusStyles(status);
  const previewText = `Update on your ${documentType} request: ${status.replace(/_/g, " ")}`;

  // Default to a fallback URL if env is not present
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://neu-arrs.vercel.app";

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Inter"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hiA.woff2',
            format: 'woff2',
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#f6f9fc] my-auto mx-auto font-sans pt-8 pb-8">
          <Container className="bg-white border border-solid border-[#e5e7eb] rounded-xl my-[20px] mx-auto w-[480px] overflow-hidden shadow-sm">
            {/* Header Banner */}
            <Section className="bg-slate-900 py-[28px] px-[32px] text-center">
              <Img
                src="https://neu.edu.ph/main/assets/images/webp/neulogo.webp"
                width="64"
                height="64"
                alt="New Era University"
                className="mx-auto mb-[16px]"
              />
              <Text className="text-white text-[22px] m-0 font-bold tracking-wider">
                NEU REGISTRAR
              </Text>
              <Text className="text-slate-400 text-[13px] m-0 mt-1 uppercase tracking-widest font-medium">
                Academic Record Request System
              </Text>
            </Section>

            <Section className="px-[32px] py-[32px]">
              <Heading className="text-slate-900 text-[22px] font-bold text-center p-0 mt-0 mb-[24px] mx-0">
                Document Status Update
              </Heading>
              
              <Text className="text-slate-700 text-[15px] leading-[24px] mb-4">
                Hello <strong>{studentName}</strong>,
              </Text>
              <Text className="text-slate-700 text-[15px] leading-[24px] mb-6">
                There is an update regarding your request for your <strong>{documentType}</strong>.
              </Text>
              
              {/* Semantic Status Badge */}
              <Section className={`text-center mb-[24px] rounded-lg p-[16px] border ${styles.border} ${styles.bg}`}>
                <Text className={`text-[16px] font-bold m-0 uppercase tracking-wider ${styles.text}`}>
                  Status: {status.replace(/_/g, " ")}
                </Text>
                {cancelReason && (
                  <Text className="text-red-600 text-[14px] mt-[8px] mb-0 italic">
                    Reason: {cancelReason}
                  </Text>
                )}
              </Section>

              {/* Dynamic Custom Message Box */}
              {customMessage && (
                <Section className={`${styles.msgBg} rounded-lg p-[20px] mb-[32px] border-l-4 ${styles.border}`}>
                  <Text className={`text-[15px] leading-[24px] m-0 whitespace-pre-wrap ${styles.text}`}>
                    {customMessage}
                  </Text>
                </Section>
              )}

              {/* Call to Action */}
              <Section className="text-center mt-[32px] mb-[32px]">
                <Button
                  className="bg-indigo-600 rounded-md text-white text-[15px] font-semibold no-underline text-center px-6 py-3 shadow-sm"
                  href={`${appUrl}/dashboard`}
                >
                  View Request Portal
                </Button>
              </Section>
            </Section>

            {/* Footer */}
            <Section className="px-[32px] pb-[32px]">
              <Hr className="border border-solid border-[#e5e7eb] my-[20px] mx-0 w-full" />
              
              <Text className="text-slate-500 text-[13px] leading-[24px] m-0 mb-[16px]">
                Respectfully,<br/>
                <strong>Office of the University Registrar</strong><br/>
                New Era University
              </Text>

              <Text className="text-slate-400 text-[12px] leading-[20px] m-0">
                For inquiries, please contact <Link href="mailto:registrar@neu.edu.ph" className="text-indigo-600 underline">registrar@neu.edu.ph</Link>.<br/>
                © {new Date().getFullYear()} New Era University. All rights reserved.
              </Text>
              
              <Text className="text-slate-300 text-[10px] leading-[16px] mt-[16px] mb-0">
                This email was intended for {studentName}. If you did not request this document, please ignore this email.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default StatusUpdateEmail;
