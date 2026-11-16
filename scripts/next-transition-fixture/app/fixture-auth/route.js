import { cookies } from "next/headers";
export async function POST() {
  (await cookies()).set("synthetic_transition_actor", "student", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 600 });
  return Response.json({ success: true });
}
export async function DELETE() {
  (await cookies()).delete("synthetic_transition_actor");
  return Response.json({ success: true });
}
