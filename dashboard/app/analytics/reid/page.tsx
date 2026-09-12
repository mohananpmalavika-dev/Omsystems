import { PersonReIdWorkspace } from "@/components/person-reid-workspace";

export const metadata = {
  title: "Multi-Camera Person Re-Identification | Sentinel Grid",
  description: "Cross-camera visual feature embedding to track person movement across branch cameras.",
};

export default function PersonReIdPage() {
  return <PersonReIdWorkspace />;
}
