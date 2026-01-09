import Link from "next/link";
import { Button } from "./Button";
import Image from "next/image";

export function ProductTiles({
  tiles,
}: {
  tiles: readonly {
    title: string;
    body: string;
    href: string;
    cta: string;
    imagery?: {
      src: string;
      alt: string;
    };
  }[];
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {tiles.map((t) => (
        <div
          key={t.title}
          className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
        >
          <h3 className="text-xl font-extrabold text-brand-dark">{t.title}</h3>
          {t.imagery && (
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden">
              <Image
                src={t.imagery.src}
                alt={t.imagery.alt}
                fill
                className="object-cover"
              />
            </div>
          )}
          <p className="mt-2 text-sm leading-relaxed text-brand-gray">
            {t.body}
          </p>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Link
              href={t.href}
              className="text-sm font-semibold text-brand-dark hover:underline"
            >
              Learn more
            </Link>
            <Button
              href={t.href + (t.href.includes("?") ? "&" : "?") + "cta=1"}
            >
              {t.cta}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
