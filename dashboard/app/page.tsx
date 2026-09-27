import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CommandCenterView } from "@/components/operations/command-center-view";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import "./command-center-focus.css";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sentinel_access")?.value;
  if (!sessionToken) {
    redirect("/login");
  }

  return (
    <div className="overview-page max-w-[1480px] mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <ErrorBoundary>
        <CommandCenterView />
      </ErrorBoundary>
    </div>
  );
}

