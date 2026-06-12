"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createRequest } from "@/app/actions/request.actions";
import { toast } from "sonner";
import { DocumentType, Purpose, DocumentConfig } from "@prisma/client";
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

export function RequestForm({ documentConfigs }: { documentConfigs: DocumentConfig[] }) {
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
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      
      {/* Left Column: Form Fields */}
      <div className="lg:col-span-2 space-y-8 bg-background/70 backdrop-blur-xl border border-primary/10 rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(10,92,54,0.1)]">
        
        {/* Document Type Section */}
        <div className="space-y-4">
          <label className="text-base font-bold tracking-tight">1. Document Type <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {documentConfigs.map((doc) => (
              <motion.div
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                key={doc.typeId}
                onClick={() => setDocumentType(doc.typeId as DocumentType)}
                className={`relative cursor-pointer rounded-2xl border p-5 transition-all duration-300 ${
                  documentType === doc.typeId 
                    ? "border-primary bg-primary/5 ring-1 ring-primary shadow-md" 
                    : "border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl ${documentType === doc.typeId ? "bg-gold/20 text-gold dark:text-gold" : "bg-muted text-muted-foreground"}`}>
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm ${documentType === doc.typeId ? "text-gold dark:text-gold" : "text-foreground"}`}>
                        {doc.label}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">{doc.description}</p>
                      <span className={`text-sm font-extrabold ${documentType === doc.typeId ? "text-gold dark:text-gold" : "text-foreground"}`}>
                        ₱{(doc.price / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </span>
                    </div>
                  </div>
                  {documentType === doc.typeId && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-gold dark:text-gold">
                      <Check className="w-5 h-5" />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Purpose Section */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <label className="text-base font-bold tracking-tight">2. Purpose of Request <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PurposeOptions.map((opt) => (
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={opt.id}
                onClick={() => setPurpose(opt.id as Purpose)}
                className={`cursor-pointer rounded-xl border px-4 py-3 text-center text-sm font-semibold transition-all duration-300 ${
                  purpose === opt.id 
                    ? "border-primary bg-primary/10 text-gold dark:text-gold ring-1 ring-primary shadow-sm" 
                    : "border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30"
                }`}
              >
                {opt.label}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Payment Method Section */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <label className="text-base font-bold tracking-tight">3. Payment Method <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setPaymentMethod("online")}
              className={`relative cursor-pointer rounded-2xl border p-5 transition-all duration-300 ${
                paymentMethod === "online" 
                  ? "border-primary bg-primary/5 ring-1 ring-primary shadow-md" 
                  : "border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl ${paymentMethod === "online" ? "bg-gold/20 text-gold dark:text-gold" : "bg-muted text-muted-foreground"}`}>
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h4 className={`font-bold text-sm ${paymentMethod === "online" ? "text-gold dark:text-gold" : "text-foreground"}`}>
                    Online Payment
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">GCash, Maya, or Credit Card via PayMongo</p>
                </div>
              </div>
              {paymentMethod === "online" && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-gold dark:text-gold">
                  <Check className="w-5 h-5" />
                </motion.div>
              )}
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setPaymentMethod("cash")}
              className={`relative cursor-pointer rounded-2xl border p-5 transition-all duration-300 ${
                paymentMethod === "cash" 
                  ? "border-primary bg-primary/5 ring-1 ring-primary shadow-md" 
                  : "border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl ${paymentMethod === "cash" ? "bg-gold/20 text-gold dark:text-gold" : "bg-muted text-muted-foreground"}`}>
                  <Landmark className="w-6 h-6" />
                </div>
                <div>
                  <h4 className={`font-bold text-sm ${paymentMethod === "cash" ? "text-gold dark:text-gold" : "text-foreground"}`}>
                    Cash at Window
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Pay in person at the Registrar office</p>
                </div>
              </div>
              {paymentMethod === "cash" && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-gold dark:text-gold">
                  <Check className="w-5 h-5" />
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>

      </div>

      {/* Right Column: Sticky Order Summary */}
      <div className="lg:col-span-1 lg:sticky lg:top-24 space-y-6">
        <div className="bg-background/70 backdrop-blur-xl border border-primary/20 rounded-3xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          
          <h4 className="font-extrabold text-lg mb-6 tracking-tight">Order Summary</h4>
          
          {documentType ? (
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-start text-sm">
                <span className="text-muted-foreground font-medium pr-4">
                  {documentConfigs.find(d => d.typeId === documentType)?.label || "Selected Document"}
                </span>
                <span className="font-bold text-foreground">
                  ₱{((documentConfigs.find(d => d.typeId === documentType)?.price || 0) / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
                </span>
              </div>
              
              {paymentMethod === "online" && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Processing Fee</span>
                  <span className="font-bold text-foreground">₱0.00</span>
                </div>
              )}
              
              <div className="border-t border-border/50 pt-4 mt-4 flex justify-between items-center">
                <span className="font-extrabold text-base">Total Due</span>
                <span className="text-2xl font-black text-gold dark:text-gold">
                  ₱{((documentConfigs.find(d => d.typeId === documentType)?.price || 0) / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 relative z-10">
              <p className="text-muted-foreground text-sm font-medium">Select a document to see your summary.</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            type="submit" 
            size="lg"
            disabled={isSubmitting || !documentType || !purpose || !paymentMethod}
            className="w-full bg-primary hover:bg-primary/90 text-white shadow-[0_4px_20px_rgba(10,92,54,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] rounded-2xl h-14 text-lg font-bold"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Processing...
              </span>
            ) : "Submit Request"}
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="lg"
            onClick={() => router.push("/dashboard")}
            disabled={isSubmitting}
            className="w-full rounded-2xl hover:bg-muted font-semibold"
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
