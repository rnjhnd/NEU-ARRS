"use client";

import { Request as RequestType } from "@prisma/client";
import { Check, FileText, Activity, Package, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

interface RequestTrackerProps {
  request: RequestType;
}

const steps = [
  { id: "PENDING_PAYMENT", label: "Payment & Review", icon: FileText },
  { id: "PROCESSING", label: "Processing", icon: Activity },
  { id: "READY_FOR_PICKUP", label: "Ready for Pickup", icon: Package },
  { id: "COMPLETED", label: "Completed", icon: CheckCircle2 },
];

export function RequestTracker({ request }: RequestTrackerProps) {
  const { status, cancelReason, createdAt, updatedAt } = request;

  if (status === "CANCELLED") {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mb-4">
          <XCircle className="w-8 h-8" />
        </div>
        <h4 className="font-bold text-lg text-foreground">Request Cancelled</h4>
        <p className="text-muted-foreground text-sm max-w-md mt-1 text-center mx-auto break-words">
          {cancelReason ? `Reason: ${cancelReason}` : "This request was cancelled and will not be processed."}
        </p>
        <p className="text-xs text-muted-foreground mt-4 font-mono">
          Cancelled on: {format(new Date(updatedAt), "MMM d, yyyy h:mm a")}
        </p>
      </div>
    );
  }

  const currentStepIndex = steps.findIndex(s => s.id === status);
  const activeIndex = currentStepIndex === -1 ? 0 : currentStepIndex;

  return (
    <div className="w-full py-6 px-10 sm:px-16">
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
          const isFirst = index === 0;
          const isLastActive = index === activeIndex || (status === "COMPLETED" && index === steps.length - 1);

          const Icon = step.icon;
          
          let timeLabel = "";
          if (isFirst) {
            timeLabel = format(new Date(createdAt), "MMM d, h:mm a");
          } else if (isLastActive) {
            timeLabel = format(new Date(updatedAt), "MMM d, h:mm a");
          }

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
              <div className="absolute top-16 sm:top-20 w-32 text-center flex flex-col items-center">
                <p className={`text-xs sm:text-sm font-semibold ${isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
                {timeLabel && (
                  <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {timeLabel}
                  </span>
                )}
                {isCurrent && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping mt-3"></span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Spacer to account for absolute positioned labels */}
      <div className="h-16 sm:h-20"></div>
    </div>
  );
}
