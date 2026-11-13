"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { createRequest } from "@/app/actions/request.actions";
import { toast } from "sonner";
import { Purpose } from "@prisma/client";
import type { StudentCatalogItem } from "@/lib/configuration-model";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Check, FileText, CreditCard, Landmark, Loader2 } from "lucide-react";

const PurposeOptions = [
  { id: "EMPLOYMENT", label: "Employment" },
  { id: "BOARD_EXAM", label: "Board Exam" },
  { id: "TRANSFER", label: "School Transfer" },
  { id: "SCHOLARSHIP", label: "Scholarship" },
  { id: "PERSONAL", label: "Personal Copy" },
  { id: "OTHER", label: "Other Reason" }
];
type RequestFormProps = { actorId: string; documentConfigs: StudentCatalogItem[]; paymentMethods: { online: boolean; cash: boolean } };
export function RequestForm(props: RequestFormProps) {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <p role="status">Verifying your account...</p>;
  if (!user || user.id !== props.actorId || user.publicMetadata.role != null && user.publicMetadata.role !== "student") return <p role="alert">Account access changed. Reload your dashboard before submitting.</p>;
  return <StudentRequestForm key={props.actorId} {...props} />;
}

function StudentRequestForm({ actorId, documentConfigs, paymentMethods }: RequestFormProps) {
  const router = useRouter();
  const submissionStorageKey = "neu-arrs:new-request:v2:" + actorId;
  const active = useRef(true);
  const frozenForm = useRef<FormData | null>(null);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const submissionKeyRef = useRef<string | null>(null);
  
  // Form State
  const [studentName, setStudentName] = useState<string>("");
  const [studentNumber, setStudentNumber] = useState<string>("");
  const [documentTypeId, setDocumentTypeId] = useState<string>("");
  const [purpose, setPurpose] = useState<Purpose | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cash" | "">("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!studentName || !studentNumber || !documentTypeId || !purpose || !paymentMethod) {
      toast.error("Please complete all required fields before submitting.");
      return;
    }
    
    // Basic format check on frontend before submitting
    const studentNumberRegex = /^\d{2}-\d{5}-\d{3}$/;
    if (!studentNumberRegex.test(studentNumber)) {
      toast.error("Student number must be in the format ##-#####-### (e.g., 22-12345-123)");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (!submissionKeyRef.current) {
        try {
          const stored = sessionStorage.getItem(submissionStorageKey);
          if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) submissionKeyRef.current = stored;
        } catch { /* Storage may be unavailable. */ }
        submissionKeyRef.current ??= crypto.randomUUID();
        try { sessionStorage.setItem(submissionStorageKey, submissionKeyRef.current); } catch { /* Keep the key in memory. */ }
      }
      if (!frozenForm.current) {
        const form = new FormData();
        for (const [key, value] of Object.entries({ submissionKey: submissionKeyRef.current, studentName, studentNumber, documentType: documentTypeId, purpose, paymentMethod })) form.set(key, value);
        frozenForm.current = form;
      }
      setUncertain(true);
      const result = await createRequest(frozenForm.current);
      if (!active.current) return;
      if (result.success || result.requestId) {
        try { sessionStorage.removeItem(submissionStorageKey); } catch { /* The server still guards replays. */ }
        if (result.success) toast.success("Your document request has been successfully submitted.");
        else toast.warning(`Your request is saved. ${result.error}`);
        if (result.redirectUrl) window.location.assign(result.redirectUrl);
        else router.push("/dashboard");
      } else {
        if (result.code === "invalid") { frozenForm.current = null; setUncertain(false); }
        toast.error(result.error || "Failed to submit your request.");
      }
    } catch {
      if (!active.current) return;
      toast.error("Submission could not be confirmed. Retry with the same details or check your dashboard first.");
    } finally {
      submittingRef.current = false;
      if (active.current) setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      
      {/* Left Column: Form Fields */}
      <fieldset disabled={isSubmitting || uncertain} className="min-w-0 lg:col-span-2"><Card className="lg:col-span-2 shadow-sm border-border bg-card rounded-3xl">
        <CardContent className="p-6 sm:p-8 space-y-8">
        
        {/* Student Details Section */}
        <div className="space-y-2">
          <p className="rounded border p-3 text-sm">Enter the name and student number on your school records. Registrar staff must verify that this identity belongs to your account before processing your request. Payment does not replace this review.</p>
          <label className="block text-base font-bold tracking-tight mb-6">1. Student Details <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="studentName" className="block text-sm font-semibold mb-4">Full Name</label>
              <input
                id="studentName"
                maxLength={200}
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Juan Dela Cruz"
                className="w-full flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
            <div>
              <label htmlFor="studentNumber" className="block text-sm font-semibold mb-4">Student Number</label>
              <input
                id="studentNumber"
                maxLength={12}
                type="text"
                value={studentNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d-]/g, '');
                  setStudentNumber(val);
                }}
                placeholder="22-12345-123"
                className="w-full flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
          </div>
        </div>

        {/* Document Type Section */}
        <div className="space-y-2 pt-10 border-t border-border/50">
          <label className="block text-base font-bold tracking-tight mb-6">2. Document Type <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {documentConfigs.map((doc) => (
              <motion.button type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                key={doc.typeId}
                aria-pressed={documentTypeId === doc.typeId}
                onClick={() => setDocumentTypeId(doc.typeId)}
                className={`relative cursor-pointer rounded-2xl border p-5 transition-all duration-300 ${
                  documentTypeId === doc.typeId
                    ? "border-primary bg-primary/5 ring-1 ring-primary shadow-md" 
                    : "border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl ${documentTypeId === doc.typeId ? "bg-primary/20 text-primary dark:text-primary" : "bg-muted text-muted-foreground"}`}>
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm ${documentTypeId === doc.typeId ? "text-primary dark:text-primary" : "text-foreground"}`}>
                        {doc.label}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">{doc.description}</p>
                      <span className={`text-sm font-extrabold ${documentTypeId === doc.typeId ? "text-primary dark:text-primary" : "text-foreground"}`}>
                        ₱{(doc.price / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </span>
                    </div>
                  </div>
                  {documentTypeId === doc.typeId && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-primary dark:text-primary">
                      <Check className="w-5 h-5" />
                    </motion.div>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Purpose Section */}
        <div className="space-y-2 pt-10 border-t border-border/50">
          <label className="block text-base font-bold tracking-tight mb-6">3. Purpose of Request <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PurposeOptions.map((opt) => (
              <motion.button type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={opt.id}
                aria-pressed={purpose === opt.id}
                onClick={() => setPurpose(opt.id as Purpose)}
                className={`cursor-pointer rounded-xl border px-4 py-3 text-center text-sm font-semibold transition-all duration-300 ${
                  purpose === opt.id 
                    ? "border-primary bg-primary/10 text-primary dark:text-primary ring-1 ring-primary shadow-sm" 
                    : "border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30"
                }`}
              >
                {opt.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Payment Method Section */}
        <div className="space-y-2 pt-10 border-t border-border/50">
          <label className="block text-base font-bold tracking-tight mb-6">4. Payment Method <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {paymentMethods.online && (
              <motion.button type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                aria-pressed={paymentMethod === "online"}
                onClick={() => setPaymentMethod("online")}
                className={`relative cursor-pointer rounded-2xl border p-5 transition-all duration-300 ${
                  paymentMethod === "online" 
                    ? "border-primary bg-primary/5 ring-1 ring-primary shadow-md" 
                    : "border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl ${paymentMethod === "online" ? "bg-primary/20 text-primary dark:text-primary" : "bg-muted text-muted-foreground"}`}>
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-sm ${paymentMethod === "online" ? "text-primary dark:text-primary" : "text-foreground"}`}>
                      Online Payment
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">GCash, Maya, or Credit Card via PayMongo</p>
                  </div>
                </div>
                {paymentMethod === "online" && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-primary dark:text-primary">
                    <Check className="w-5 h-5" />
                  </motion.div>
                )}
              </motion.button>
            )}

            {paymentMethods.cash && (
              <motion.button type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                aria-pressed={paymentMethod === "cash"}
                onClick={() => setPaymentMethod("cash")}
                className={`relative cursor-pointer rounded-2xl border p-5 transition-all duration-300 ${
                  paymentMethod === "cash" 
                    ? "border-primary bg-primary/5 ring-1 ring-primary shadow-md" 
                    : "border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl ${paymentMethod === "cash" ? "bg-primary/20 text-primary dark:text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Landmark className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-sm ${paymentMethod === "cash" ? "text-primary dark:text-primary" : "text-foreground"}`}>
                      Cash at Window
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Pay in person at the Registrar office</p>
                  </div>
                </div>
                {paymentMethod === "cash" && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-primary dark:text-primary">
                    <Check className="w-5 h-5" />
                  </motion.div>
                )}
              </motion.button>
            )}
            {!paymentMethods.online && !paymentMethods.cash && (
              <div className="col-span-1 sm:col-span-2 p-4 text-center text-sm text-red-500 bg-red-500/10 rounded-xl">
                No payment methods are currently available. Please contact the registrar.
              </div>
            )}
          </div>
        </div>

        </CardContent>
      </Card>

      </fieldset>
      {/* Right Column: Sticky Order Summary */}
      <div className="lg:col-span-1 lg:sticky lg:top-24 space-y-6">
        <Card className="shadow-sm border-border overflow-hidden bg-card rounded-3xl p-6 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          
          <h4 className="font-extrabold text-lg mb-6 tracking-tight">Order Summary</h4>
          
          {documentTypeId ? (
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-start text-sm">
                <span className="text-muted-foreground font-medium pr-4">
                  {documentConfigs.find(d => d.typeId === documentTypeId)?.label || "Selected Document"}
                </span>
                <span className="font-bold text-foreground">
                  ₱{((documentConfigs.find(d => d.typeId === documentTypeId)?.price || 0) / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
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
                <span className="text-2xl font-black text-primary dark:text-primary">
                  ₱{((documentConfigs.find(d => d.typeId === documentTypeId)?.price || 0) / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 relative z-10">
              <p className="text-muted-foreground text-sm font-medium">Select a document to see your summary.</p>
            </div>
          )}
        </Card>

        {uncertain && <p role="status">Submission may already be saved. Retry the same details or check your dashboard before creating another request.</p>}
        <div className="flex flex-col gap-3">
          <Button 
            type="submit" 
            size="lg"
            disabled={isSubmitting || !documentTypeId || !purpose || !paymentMethod}
            className="w-full bg-primary hover:bg-primary/90 text-white shadow-[0_4px_20px_rgba(10,92,54,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] rounded-2xl h-14 text-lg font-bold"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Processing...
              </span>
            ) : uncertain ? "Retry same request" : "Submit Request"}
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="lg"
            onClick={() => router.push("/dashboard")}
            disabled={isSubmitting}
            className="w-full rounded-2xl hover:bg-muted font-semibold"
          >
            {uncertain ? "Check dashboard" : "Cancel"}
          </Button>
        </div>
      </div>
    </form>
  );
}
