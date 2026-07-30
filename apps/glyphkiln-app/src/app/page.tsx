import { TEMPLATE_IDS } from "@glyphkiln/core/schema";

export default function Home() {
  return (
    <main>
      <header>
        <p>Glyphkiln</p>
        <span>Application foundation</span>
      </header>

      <section aria-labelledby="welcome-title">
        <p>Deterministic by construction</p>
        <h1 id="welcome-title">
          Turn structured direction into reproducible graphics.
        </h1>
        <p>
          The app workspace is connected to Glyphkiln Core through its public schema
          contract. Editing, previews, and export workflows come next.
        </p>
      </section>

      <section aria-labelledby="templates-title">
        <div>
          <p>Core connection</p>
          <h2 id="templates-title">Available template contracts</h2>
        </div>
        <ul>
          {TEMPLATE_IDS.map((templateId) => (
            <li key={templateId}>{templateId}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
