import { AnprWorkspace } from "@/components/anpr-workspace";

export const metadata = {
  title: "Automatic Number Plate Recognition (ANPR) | KryptoVision",
  description: "Optical vehicle license plate localization, contextual OCR syntax validation, and sub-10ms watchlist matching.",
};

export default function AnprOperationsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <AnprWorkspace />
    </div>
  );
}
