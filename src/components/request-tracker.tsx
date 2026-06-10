"use client";

import { RequestStatus } from "@prisma/client";
import { Check, FileText, Activity, Package, CheckCircle2, XCircle } from "lucide-react";

interface RequestTrackerProps {
  status: RequestStatus;
  cancelReason?: string | null;
}

const steps = [
  { id: "PENDING", label: "Request Received", icon: FileText },
  { id: "PROCESSING", label: "Processing", icon: Activity },
  { id: "READY_FOR_PICKUP", label: "Ready for Pickup", icon: Package },
  { id: "COMPLETED", label: "Completed", icon: CheckCircle2 },
];

export function RequestTracker({ status, cancelReason }: RequestTrackerProps) {
  if (status === "CANCELLED") {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mb-4">
          <XCircle className="w-8 h-8" />
        </div>
        <h4 className="font-bold text-lg text-foreground">Request Cancelled</h4>
        <p className="text-muted-foreground text-sm max-w-md mt-1">
          {cancelReason ? `Reason: ${cancelReason}` : "This request was cancelled and will not be processed."}
        </p>
      </div>
    );
  }

  // Treat PENDING_PAYMENT as PENDING visually in the tracker
  const normalizedStatus = status === "PENDING_PAYMENT" ? "PENDING" : status;
  
  const currentStepIndex = steps.findIndex(s => s.id === normalizedStatus);
  const activeIndex = currentStepIndex === -1 ? 0 : currentStepIndex;

  return (
    <div className="w-full py-6 px-2 sm:px-8">
      <div className="relative flex items-center justify-between w-full">
        {/* Connecting Line (Background) */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1.5 bg-muted rounded-full pointer-events-none"></div>
        
        {/* Connecting Line (Active) */}
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-emerald-500 rounded-full transition-all duration-700 ease-in-out pointer-events-none"
          style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }}
        ></div>

        {steps.map((step, index) => {
          const isCompleted = status === "COMPLETED" ? true : index < activeIndex;
          const isCurrent = status !== "COMPLETED" && index === activeIndex;
          const isPending = status !== "COMPLETED" && index > activeIndex;

          const Icon = step.icon;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center">
              {/* Icon Circle */}
              <div 
                className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-4 transition-all duration-500 shadow-sm ${
                  isCompleted 
                    ? "bg-emerald-500 border-background text-white" 
                    : isCurrent 
                      ? "bg-background border-emerald-500 text-emerald-600 ring-4 ring-emerald-500/20" 
                      : "bg-background border-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="w-5 h-5 sm:w-6 sm:h-6" /> : <Icon className="w-5 h-5 sm:w-6 sm:h-6" />}
              </div>
              
              {/* Label */}
              <div className="absolute top-16 sm:top-20 w-32 text-center">
                <p className={`text-xs sm:text-sm font-semibold ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
                {isCurrent && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping mt-1"></span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Spacer to account for absolute positioned labels */}
      <div className="h-12 sm:h-16"></div>
    </div>
  );
}
