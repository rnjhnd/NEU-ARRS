"use client";

import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Button, buttonVariants } from "@/components/ui/button";

interface ReceiptProps {
  receipt: {
    transactionId: string;
    dateCompleted: string;
    studentName: string;
    studentEmail: string;
    documentLabel: string;
    purpose: string;
    paymentMethod: string;
    amountPaid: number;
  };
}

export function ReceiptClient({ receipt }: ReceiptProps) {
  const handlePrint = () => {
    window.print();
  };

  const formattedDate = format(new Date(receipt.dateCompleted), "PPP 'at' p");
  const priceFormatted = (receipt.amountPaid / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });

  return (
    <div className="mx-auto max-w-3xl p-8 bg-white min-h-screen text-slate-900 font-sans">
      {/* Non-printable controls */}
      <div className="print:hidden flex items-center justify-between mb-12 border-b pb-4">
        <Link href="/dashboard" className={buttonVariants({ variant: "ghost", className: "flex items-center gap-2" })}>
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <Button onClick={handlePrint} className="flex items-center gap-2">
          <Printer className="w-4 h-4" /> Print Receipt
        </Button>
      </div>

      {/* Printable Receipt Content */}
      <div className="border border-slate-200 rounded-lg p-10 shadow-sm print:shadow-none print:border-none print:p-0">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 pb-8 border-b border-slate-200">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2 uppercase">
              Official Receipt
            </h1>
            <p className="text-slate-500 font-medium">New Era University</p>
            <p className="text-slate-400 text-sm mt-1">Document Request System</p>
          </div>
          <div className="text-left md:text-right mt-6 md:mt-0">
            <div className="text-sm text-slate-500 uppercase tracking-widest font-semibold mb-1">Receipt No.</div>
            <div className="text-lg font-mono text-slate-800">{receipt.transactionId.toUpperCase()}</div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Billed To</h3>
            <p className="font-semibold text-slate-800 text-lg">{receipt.studentName}</p>
            <p className="text-slate-500">{receipt.studentEmail}</p>
          </div>
          <div className="md:text-right">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Payment Details</h3>
            <p className="text-slate-800"><span className="text-slate-500 mr-2">Method:</span> <span className="font-semibold uppercase">{receipt.paymentMethod}</span></p>
            <p className="text-slate-800 mt-1"><span className="text-slate-500 mr-2">Date:</span> <span className="font-semibold">{formattedDate}</span></p>
          </div>
        </div>

        {/* Line Items */}
        <div className="mb-12">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800">
                <th className="py-3 font-bold text-slate-800 text-sm uppercase tracking-wider w-2/3">Description</th>
                <th className="py-3 font-bold text-slate-800 text-sm uppercase tracking-wider text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-5">
                  <p className="font-semibold text-slate-900 text-lg">{receipt.documentLabel}</p>
                  <p className="text-slate-500 text-sm mt-1">Purpose: {receipt.purpose}</p>
                </td>
                <td className="py-5 text-right font-mono text-lg text-slate-800">
                  {priceFormatted}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end pt-6 border-t-2 border-slate-800">
          <div className="w-full md:w-1/2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500 font-medium">Subtotal</span>
              <span className="font-mono text-slate-800">{priceFormatted}</span>
            </div>
            <div className="flex justify-between items-center mb-6">
              <span className="text-slate-500 font-medium">Tax / Processing</span>
              <span className="font-mono text-slate-800 uppercase text-sm">Included</span>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-slate-200">
              <span className="font-black text-xl text-slate-900 uppercase tracking-wide">Total Paid</span>
              <span className="font-black text-2xl font-mono text-emerald-600">{priceFormatted}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-24 pt-8 border-t border-slate-100 text-center text-slate-400 text-sm">
          <p>This is a computer-generated receipt. No signature is required.</p>
          <p className="mt-1">Thank you for using the NEU Automated Request and Release System.</p>
        </div>

      </div>
    </div>
  );
}
