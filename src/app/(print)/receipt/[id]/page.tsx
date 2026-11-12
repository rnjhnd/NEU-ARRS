import { getVerifiedActor } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ReceiptClient } from "./receipt-client";
import { RequestStatus } from "@prisma/client";
import { verifiedCollection } from "@/lib/monetary-ledger";

export const metadata = { title: "Document Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, role } = await getVerifiedActor();
  
  const request = await prisma.request.findUnique({
    where: { id: id }, include: { money: true }
  });

  if (!request) {
    return notFound();
  }

  // Authenticate ownership/administrator permission before exposing receipt data.
  const client = await clerkClient();
  const isAdmin = role === "admin";
  
  if (request.studentId !== userId && !isAdmin) {
    return notFound();
  }

  const isRevenue = request.paymentStatus === "PAID" || (request.paymentStatus === "CASH_ON_PICKUP" && request.status === RequestStatus.COMPLETED);
  
  if (!isRevenue) {
    // Only paid or fully completed cash requests get a formal receipt
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-red-600">
        <h1 className="text-2xl font-bold">Receipt Not Available</h1>
        <p className="mt-2 text-muted-foreground">This request has not been fully paid or completed yet.</p>
      </div>
    );
  }
  const amountCentavos = verifiedCollection(request.money, request.paymentMethod);
  if (amountCentavos === null) return <main className="p-8 text-center"><h1>Receipt Amount Needs Verification</h1><p>The registrar must reconcile the original payment evidence before this receipt can be issued. No amount has been inferred from historical values.</p></main>;

  // Fetch student details
  const student = await client.users.getUser(request.studentId);
  const studentName = `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Student";
  const studentEmail = student.emailAddresses[0]?.emailAddress || "No email provided";

  // Fetch Document Config for friendly label
  const config = await prisma.documentConfig.findUnique({
    where: { typeId: request.documentType }
  });

  const documentLabel = config?.label || request.documentType.replace("_", " ");

  const receiptData = {
    transactionId: request.id,
    dateRecorded: request.money!.verifiedAt.toISOString(),
    paidAt: request.money!.paidAt?.toISOString() ?? null,
    studentName,
    studentEmail,
    documentLabel,
    purpose: request.purpose.replace("_", " "),
    paymentMethod: request.paymentMethod,
    amountCentavos,
  };

  return <ReceiptClient receipt={receiptData} />;
}
