import { AppAlpha } from "@/features/app-alpha";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";

export default function Home() {
  return <AppAlpha catalog={createPreviewCatalog({ resourceBacked: true })} />;
}
