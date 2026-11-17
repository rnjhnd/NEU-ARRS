import { notFound } from "next/navigation";
import { workspacePage } from "../../../server-data";
export default async function Page({ params }) {
  const { view } = await params;
  if (view) notFound();
  return workspacePage("Overview");
}
