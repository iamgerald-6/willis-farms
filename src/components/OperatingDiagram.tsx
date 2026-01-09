import Image from "next/image";

export function OperatingDiagram({
  steps,
}: {
  steps: readonly { title: string; body: string }[];
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-2 items-start">
      <div className="rounded-3xl  border-black/5 bg-white p-7 shadow-soft">
        <div className="grid gap-4 ">
          <div></div>
          {steps.map((s, idx) => (
            <div key={s.title} className="relative">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">
                Step {idx + 1}
              </p>
              <p className="mt-2 text-base font-bold text-brand-dark">
                {s.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-brand-gray">
                {s.body}
              </p>
              {idx < steps.length - 1 && (
                <div className="mt-4 hidden h-px w-full bg-black/10 md:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="relative h-80 sm:h-96 lg:h-full w-full overflow-hidden rounded-3xl">
        <Image
          src="/images/operational.jpg"
          alt="Operating model illustration"
          fill
          className="object-cover"
        />
      </div>
    </div>
  );
}
