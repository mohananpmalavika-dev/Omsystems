"use client";

import { MobileCommandCenter } from "./mobile-command-center";

/** Both mobile entry points use the same authenticated, persistent incident workflow. */
export function MobileSocOperatorView() {
  return <MobileCommandCenter />;
}
