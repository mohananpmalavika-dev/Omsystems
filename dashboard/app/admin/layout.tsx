import type { ReactNode } from "react";
import "./admin-command.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-command-scope">{children}</div>;
}
