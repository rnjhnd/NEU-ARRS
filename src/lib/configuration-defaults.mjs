// Shared by Next.js, browser forms, and the native Node migration smoke tool.
export const DEFAULT_OPERATIONS = { location: "Registrar's Office at Window 4", hours: "8:00 AM to 5:00 PM (Monday-Friday)" };

/** @param {{ location: string, hours: string }} [ops] */
export function defaultEmailTemplates(ops = DEFAULT_OPERATIONS) {
  return {
    PENDING_PAYMENT: "Your request is awaiting payment or registrar review.",
    PROCESSING: "We are processing your document. Please allow 3-5 business days for completion.",
    READY_FOR_PICKUP: `Your document is ready for pickup at ${ops.location} between ${ops.hours}. Please bring your valid Student ID.`,
    COMPLETED: "Your document request has been completed and claimed. Thank you for using NEU-ARRS.",
    CANCELLED: "Your document request is cancelled. Contact the registrar about any unconfirmed payment or refund.",
  };
}
