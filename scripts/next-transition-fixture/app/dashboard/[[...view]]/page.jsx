import { notFound } from "next/navigation";
import { workspacePage } from "../../../server-data";
export default async function Page({ params }) {
  const { view } = await params;
  if (view && (view.length !== 1 || view[0] !== "reports")) notFound();
  return workspacePage(view ? "Reports" : "Overview");
}
