export function Testimonials() {
  const items = [
    {
      quote:
        "Plugg has transformed the way we manage our farm operations. The platform is intuitive, reliable, and has made tracking day-to-day activities much easier.",
      name: "Farm Operator, Ghana",
    },
    {
      quote:
        "Working with Plugg has streamlined our procurement process significantly. It's efficient, user-friendly, and has improved our supply chain visibility.",
      name: "Procurement Lead, B2B Buyer",
    },
  ];

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {items.map((t) => (
        <figure
          key={t.name}
          className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
        >
          <blockquote className="text-sm leading-relaxed text-brand-gray">
            “{t.quote}”
          </blockquote>
          <figcaption className="mt-4 text-sm font-semibold text-brand-dark">
            {t.name}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
