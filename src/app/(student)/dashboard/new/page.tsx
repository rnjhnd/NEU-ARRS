import { NewRequestData } from "./request-data";
import { withVerifiedPage } from "@/components/verified-page";
import { Suspense } from "react";
import { NewRequestShell, RequestFormSkeleton } from "./page-shell";

export const metadata = { title: "New Document Request" };

async function NewRequestPage() {
  return <NewRequestShell><Suspense fallback={<RequestFormSkeleton />}><NewRequestData /></Suspense></NewRequestShell>;
}

export default withVerifiedPage(NewRequestPage, ["student"]);
