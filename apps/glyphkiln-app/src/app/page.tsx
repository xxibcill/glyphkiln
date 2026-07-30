import { ProjectPreview } from "@/features/project-preview";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";

export default function Home() {
  return <ProjectPreview catalog={createPreviewCatalog()} />;
}
