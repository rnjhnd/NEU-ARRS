"use client";

import { Button } from "@/components/ui/button";
import { Download, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

type ReceiptData = {
  transactionId: string;
  dateCompleted: string;
  studentName: string;
  studentEmail: string;
  documentLabel: string;
  purpose: string;
  paymentMethod: string;
  amountPaid: number;
};

export function ReceiptClient({ receipt }: { receipt: ReceiptData }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 print:py-0 print:bg-white flex flex-col items-center">
      
      {/* Controls - Hidden during print */}
      <div className="w-full max-w-3xl mb-8 flex justify-end px-4 print:hidden">
        <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
          <Download className="w-4 h-4 mr-2" /> Download PDF Receipt
        </Button>
      </div>

      {/* Printable Receipt Paper */}
      <div className="w-full max-w-3xl bg-white shadow-xl print:shadow-none p-10 sm:p-16 border border-slate-200 print:border-none mx-4">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-8 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">NEW ERA UNIVERSITY</h1>
            <p className="text-slate-500 font-medium mt-1">Office of the University Registrar</p>
            <p className="text-slate-400 text-sm mt-1">No. 9 Central Ave, New Era, Quezon City, 1107 Metro Manila</p>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-light text-slate-300 uppercase tracking-widest">Receipt</h2>
            <p className="text-slate-600 font-medium mt-2">#{receipt.transactionId.slice(-8).toUpperCase()}</p>
          </div>
        </div>

        {/* Success Banner */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-center gap-3 mb-10 print:bg-emerald-50/50">
          <CheckCircle2 className="text-emerald-600 w-6 h-6" />
          <p className="text-emerald-800 font-medium">Payment completed successfully on {format(new Date(receipt.dateCompleted), "MMMM d, yyyy h:mm a")}</p>
        </div>

        {/* Two-Column Details */}
        <div className="grid grid-cols-2 gap-12 mb-12">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed To</h3>
            <p className="font-bold text-slate-900 text-lg">{receipt.studentName}</p>
            <p className="text-slate-600">{receipt.studentEmail}</p>
            <p className="text-slate-600 mt-2 capitalize font-medium">
              Payment Method: {receipt.paymentMethod}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Transaction Details</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate-500">Receipt ID:</span>
              <span className="font-medium text-slate-900 text-right">{receipt.transactionId}</span>
              
              <span className="text-slate-500">Date Issued:</span>
              <span className="font-medium text-slate-900 text-right">{format(new Date(receipt.dateCompleted), "MMM dd, yyyy")}</span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-12">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-900">
                <th className="py-3 text-sm font-bold text-slate-900 uppercase">Description</th>
                <th className="py-3 text-sm font-bold text-slate-900 uppercase text-center">Purpose</th>
                <th className="py-3 text-sm font-bold text-slate-900 uppercase text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="py-5">
                  <p className="font-bold text-slate-900">{receipt.documentLabel}</p>
                  <p className="text-slate-500 text-sm mt-1">Official Document Processing Fee</p>
                </td>
                <td className="py-5 text-center text-slate-700 capitalize">{receipt.purpose.toLowerCase()}</td>
                <td className="py-5 text-right font-bold text-slate-900">
                  ₱{(receipt.amountPaid / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-16">
          <div className="w-1/2 max-w-sm">
            <div className="flex justify-between py-2 text-slate-600">
              <span>Subtotal</span>
              <span>₱{(receipt.amountPaid / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div className="flex justify-between py-2 text-slate-600">
              <span>Processing Fee</span>
              <span>₱0.00</span>
            </div>
            <div className="flex justify-between py-4 mt-2 border-t-2 border-slate-900 text-xl font-black text-slate-900">
              <span>Total Paid</span>
              <span>₱{(receipt.amountPaid / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center border-t border-slate-200 pt-8 mt-auto">
          <p className="text-slate-500 font-medium text-sm">Thank you for your request.</p>
          <p className="text-slate-400 text-xs mt-2">
            This is an electronically generated receipt and does not require a physical signature.
            <br />
            For any concerns, please present this receipt to the Registrar's Office.
          </p>
        </div>

      </div>
    </div>
  );
}
