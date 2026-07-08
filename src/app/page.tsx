import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId, sessionClaims } = await auth();

  // If user is already logged in, seamlessly redirect them to their respective portal
  if (userId) {
    const role = sessionClaims?.metadata?.role;
    if (role === "admin" || role === "employee") {
      redirect("/admin");
    } else {
      redirect("/dashboard");
    }
  }

  // If not logged in, bypass the landing page and go straight to sign in
  redirect("/sign-in");
}
