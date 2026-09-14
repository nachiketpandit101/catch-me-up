import type { Metadata } from "next";
import { LibraryHome } from "@/components/LibraryHome";

export const metadata: Metadata = {
  title: "Library",
  description: "Browse the shelf and pick the series you need to catch up on.",
};

export default function LibraryPage() {
  return <LibraryHome />;
}
