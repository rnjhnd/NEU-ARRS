import { auth } from "@clerk/nextjs/server";
import { getVerifiedActor } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const actor = await getVerifiedActor();
  redirect(actor.role === "student" ? "/dashboard" : "/admin");
}
