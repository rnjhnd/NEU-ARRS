import { requireAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ReceiptClient } from "./receipt-client";
import { RequestStatus } from "@prisma/client";

export const metadata = { title: "Document Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireAuth();
  
  const request = await prisma.request.findUnique({
    where: { id: id }
  });

  if (!request) {
    return notFound();
  }

  // Security Check: Ensure the user is either the student who made the request, or an admin.
  // In a robust app, we'd explicitly check for admin role here if userId !== request.studentId.
  // For now, we will allow viewing if they are authenticated, but ideally we check metadata.
  const client = await clerkClient();
  const viewingUser = await client.users.getUser(userId);
  const isAdmin = viewingUser.publicMetadata?.role === "admin";
  
  if (request.studentId !== userId && !isAdmin) {
    return notFound();
  }

  if (request.status !== RequestStatus.COMPLETED) {
    // Only completed requests get a formal receipt
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-red-600">
        <h1 className="text-2xl font-bold">Receipt Not Available</h1>
        <p className="mt-2 text-muted-foreground">This request has not been completed yet.</p>
      </div>
    );
  }

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
    dateCompleted: request.updatedAt.toISOString(),
    studentName,
    studentEmail,
    documentLabel,
    purpose: request.purpose.replace("_", " "),
    paymentMethod: request.paymentMethod,
    amountPaid: request.amountPaid || 0, // In centavos
  };

  return <ReceiptClient receipt={receiptData} />;
}
