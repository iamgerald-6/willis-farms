import { Container } from "./Container";
import { Button } from "./Button";
import { Badge } from "./Badge";
import Image from "next/image";
import { motion } from "framer-motion";
export function Hero({
  headline,
  subhead,
  primaryCta,
  secondaryCta,
  proof,
}: {
  headline: string;
  subhead: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  proof: readonly string[];
}) {
  return (
    <section className="relative overflow-hidden md:min-h-[90vh]">
      <Image
        src="/images/bgimage1.jpg"
        alt=""
        fill
        priority
        className="-z-20 object-cover"
      />

      {/* Optional dark overlay */}
      <div className="absolute inset-0 -z-10 bg-black/40" />

      <Container className="py-14 sm:py-20 ">
        <div className="flex items-center  md:min-h-[60vh]">
          {/* Content wrapper */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center lg:text-left max-w-4xl"
          >
            {/* <div className="mb-5 flex flex-wrap gap-2 justify-center lg:justify-start">
              {proof.map((p) => (
                <Badge key={p}>{p}</Badge>
              ))}
            </div> */}

            <h1 className="text-3xl font-extrabold tracking-tight text-brand-light sm:text-5xl">
              {headline}
            </h1>

            <p className="mt-5 text-base leading-relaxed text-gray-200 sm:text-lg">
              {subhead}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button href={primaryCta.href}>{primaryCta.label}</Button>
              <Button href={secondaryCta.href} variant="secondary">
                {secondaryCta.label}
              </Button>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
