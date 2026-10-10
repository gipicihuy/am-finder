/** Blok "Step by step" yang dipakai di tab Link dan tab Cari Preset. */
export function HowSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <section className="how" data-nosnippet>
      <h2 className="how-title">{title}</h2>
      <ol className="how-list">
        {steps.map((step, index) => (
          <li key={step}>
            <span className="how-num" aria-hidden="true">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
