import type { ReactNode } from "react";

import type { RevisionComparison } from "./api-client";

export function RevisionProofFigure({
  side,
  caption,
  alt,
}: {
  side: RevisionComparison["left"];
  caption: ReactNode;
  alt: string;
}) {
  const png = side.proof.outputs.find((output) => output.format === "png");
  return (
    <figure>
      <figcaption>{caption}</figcaption>
      {png === undefined ? null : (
        // eslint-disable-next-line @next/next/no-img-element -- parser-verified bounded Core proof, not a network image.
        <img src={`data:${png.mimeType};base64,${png.base64}`} alt={alt} />
      )}
    </figure>
  );
}
