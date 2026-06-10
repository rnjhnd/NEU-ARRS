import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

interface StatusUpdateEmailProps {
  studentName: string;
  documentType: string;
  status: string;
  cancelReason?: string | null;
  customMessage?: string;
}

export const StatusUpdateEmail = ({
  studentName = 'Student',
  documentType = 'Document',
  status = 'PROCESSING',
  cancelReason,
  customMessage,
}: StatusUpdateEmailProps) => {
  const isCancelled = status === "CANCELLED";
  const previewText = `Update on your ${documentType} request: ${status.replace(/_/g, " ")}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-white my-auto mx-auto font-sans">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] w-[465px]">
            <Section className="mt-[32px]">
              <Text className="text-[#10b981] text-[24px] font-normal text-center p-0 my-[30px] mx-0 font-bold tracking-tight">
                NEU-ARRS
              </Text>
            </Section>
            <Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
              Document Status Update
            </Heading>
            <Text className="text-black text-[14px] leading-[24px]">
              Hello {studentName},
            </Text>
            <Text className="text-black text-[14px] leading-[24px]">
              There is an update regarding your request for <strong>{documentType}</strong>.
            </Text>
            
            <Section className={`text-center mt-[32px] mb-[32px] rounded p-[20px] ${isCancelled ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <Text className={`text-[18px] font-bold ${isCancelled ? 'text-red-600' : 'text-emerald-600'}`}>
                New Status: {status.replace(/_/g, " ")}
              </Text>
              {cancelReason && (
                <Text className="text-red-500 text-[14px] mt-2 italic">
                  Reason: {cancelReason}
                </Text>
              )}
            </Section>

            {customMessage && (
              <Section className="bg-[#f5f5f5] rounded p-[16px] mb-[32px] border-l-4 border-emerald-500">
                <Text className="text-black text-[14px] leading-[24px] m-0 whitespace-pre-wrap">
                  {customMessage}
                </Text>
              </Section>
            )}

            <Text className="text-black text-[14px] leading-[24px]">
              You can track the full progress of your request at any time by logging into the NEU Academic Record Request System.
            </Text>
            
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              This email was intended for {studentName}. If you did not request this document, please ignore this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default StatusUpdateEmail;
