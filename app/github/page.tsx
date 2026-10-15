import { redirect } from "next/navigation";

// Keep old bookmarks usable after the workspace redesign.
export default function RetiredPage() { redirect("/review"); }
