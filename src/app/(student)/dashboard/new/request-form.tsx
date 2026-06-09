"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createRequest } from "@/app/actions/request.actions";
import { toast } from "sonner";
import { DocumentType, Purpose } from "@prisma/client";
import { motion } from "framer-motion";
import { Check, FileText, CreditCard, Landmark, Loader2 } from "lucide-react";

const PurposeOptions = [
  { id: "EMPLOYMENT", label: "Employment" },
  { id: "BOARD_EXAM", label: "Board Exam" },
  { id: "TRANSFER", label: "School Transfer" },
  { id: "SCHOLARSHIP", label: "Scholarship" },
  { id: "PERSONAL", label: "Personal Copy" },
  { id: "OTHER", label: "Other Reason" }
];

export function RequestForm({ documentConfigs }: { documentConfigs: any[] }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [purpose, setPurpose] = useState<Purpose | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cash" | "">("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentType || !purpose || !paymentMethod) {
      toast.error("Please fill out all required fields.");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("documentType", documentType);
    formData.append("purpose", purpose);
    formData.append("paymentMethod", paymentMethod);

    const result = await createRequest(formData);

    if (result.success) {
      toast.success("Request submitted successfully.");
      if (result.redirectUrl) {
        router.push(result.redirectUrl);
      } else {
        router.push("/dashboard");
      }
    } else {
      toast.error(result.error);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      
      {/* Document Type Section */}
      <div className="space-y-3">
        <label className="text-sm font-semibold tracking-tight">Document Type <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {documentConfigs.map((doc) => (
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              key={doc.typeId}
              onClick={() => setDocumentType(doc.typeId as DocumentType)}
              className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                documentType === doc.typeId 
                  ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm" 
                  : "border-border bg-card hover:bg-muted/50 hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${documentType === doc.typeId ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={`font-semibold text-sm ${documentType === doc.typeId ? "text-primary" : "text-foreground"}`}>
                      {doc.label}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-1">{doc.description}</p>
                    <span className={`text-xs font-bold ${documentType === doc.typeId ? "text-primary" : "text-foreground"}`}>
                      ₱{(doc.price / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </span>
                  </div>
                </div>
                {documentType === doc.typeId && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-primary">
                    <Check className="w-5 h-5" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Purpose Section */}
      <div className="space-y-3 pt-4 border-t">
        <label className="text-sm font-semibold tracking-tight">Purpose of Request <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PurposeOptions.map((opt) => (
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              key={opt.id}
              onClick={() => setPurpose(opt.id as Purpose)}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-all ${
                purpose === opt.id 
                  ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" 
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {opt.label}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Payment Method Section */}
      <div className="space-y-3">
        <label className="text-sm font-semibold tracking-tight">Payment Method <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setPaymentMethod("online")}
            className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
              paymentMethod === "online" 
                ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm" 
                : "border-border bg-card hover:bg-muted/50 hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${paymentMethod === "online" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h4 className={`font-semibold text-sm ${paymentMethod === "online" ? "text-primary" : "text-foreground"}`}>
                  Online Payment
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">GCash, Maya, or Credit Card via PayMongo</p>
              </div>
            </div>
            {paymentMethod === "online" && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-primary">
                <Check className="w-5 h-5" />
              </motion.div>
            )}
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setPaymentMethod("cash")}
            className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
              paymentMethod === "cash" 
                ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm" 
                : "border-border bg-card hover:bg-muted/50 hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${paymentMethod === "cash" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h4 className={`font-semibold text-sm ${paymentMethod === "cash" ? "text-primary" : "text-foreground"}`}>
                  Cash at Window
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">Pay in person at the Registrar office</p>
              </div>
            </div>
            {paymentMethod === "cash" && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-primary">
                <Check className="w-5 h-5" />
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Order Summary */}
      {documentType && (
        <div className="pt-6 border-t mt-8">
          <div className="bg-muted/50 rounded-xl p-5 border border-border space-y-4">
            <h4 className="font-semibold text-sm">Order Summary</h4>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                {documentConfigs.find(d => d.typeId === documentType)?.label || "Selected Document"}
              </span>
              <span className="font-medium">
                ₱{((documentConfigs.find(d => d.typeId === documentType)?.price || 0) / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
              </span>
            </div>
            {paymentMethod === "online" && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Processing Fee</span>
                <span className="font-medium">₱0.00</span>
              </div>
            )}
            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-bold">Total Due</span>
              <span className="text-xl font-bold text-primary">
                ₱{((documentConfigs.find(d => d.typeId === documentType)?.price || 0) / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Submit Action */}
      <div className="flex items-center justify-end gap-3 pt-6 border-t mt-8">
        <Button 
          type="button" 
          variant="ghost" 
          onClick={() => router.push("/dashboard")}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isSubmitting || !documentType || !purpose || !paymentMethod}
          className="min-w-[150px] shadow-[0_4px_15px_rgba(10,92,54,0.3)] dark:shadow-[0_4px_15px_rgba(10,92,54,0.15)] transition-transform hover:scale-105 active:scale-95"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Processing
            </span>
          ) : "Submit Request"}
        </Button>
      </div>
    </form>
  );
}
