import type { ReactNode } from "react";
import { AdminCommandDeck } from "@/components/admin/admin-command-deck";
import "./admin-command.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-command-scope"><AdminCommandDeck />{children}</div>;
}
