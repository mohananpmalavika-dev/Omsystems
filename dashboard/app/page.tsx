import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sentinel_access")?.value;
  if (!sessionToken) {
    redirect("/login");
  }
  redirect("/control-room");
}

