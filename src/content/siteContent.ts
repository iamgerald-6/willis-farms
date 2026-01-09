import {
  Dna,
  BadgeCheck,
  FileText,
  Settings,
  ShieldCheck,
  Truck,
  Layers,
  Shield,
  CalendarCheck,
} from "lucide-react";
export type NavItem = { label: string; href: string };

export const siteContent = {
  brand: {
    name: "Wills Farms Ltd",
    tagline:
      "Genetics-led, vertically integrated pork—built on quality, biosecurity, and performance.",
    logo: {
      src: "/brand/logo.svg",
      alt: "Wills Farms Ltd logo",
    },
    colors: {
      primary: "brand.red",
      neutrals: ["white", "brand.light", "brand.gray", "brand.dark"],
    },
  },
  affiliation: {
    headline: "Powered by Axiom Genetics, France",
    subline:
      "A member of the E-zootech Genetics network. Serving Ghana and West Africa with disciplined genetics and reliable supply.",
  },
  contact: {
    locationAddress:
      "EG-508-0449, Yaw Densu, Nsawam–Kotar Road, Eastern Region",
    postalAddress: "WY 2662, Kwabenya, Accra",
    email: "info@willsfarms.com",
    phones: ["+233 268 379 722", "+233 204 247 407"],
    whatsappNumber: "+233268379722", // used for click-to-chat (E.164, no spaces)
  },
  nav: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },

    { label: "Our Services", href: "/our-service" },

    { label: "News & Insights", href: "/news" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
  ] satisfies NavItem[],
  home: {
    hero: {
      headline:
        "High-performance breeding stock and premium pork—built on quality, biosecurity, and performance.",
      subhead:
        "A member of E-zootech Genetics network, powered by Axiom Genetics France. Serving Ghana and West Africa.",
      primaryCta: { label: "Request Gilts", href: "/contact?interest=gilts" },
      secondaryCta: {
        label: "Request Pork Supply Quote",
        href: "/contact?interest=pork",
      },
    },
    proofBar: [
      "Axiom affiliation",
      "Biosecurity-first",
      "Documented performance",
      "Reliable supply",
    ],
    pillars: [
      {
        title: "Genetics discipline",
        body: "Structured breeding program with focus on performance, consistency, and measurable outcomes.",
        icon: Dna,
      },
      {
        title: "Biosecurity-led operations",
        body: "Controlled access, SOPs, hygiene routines, quarantine, and ongoing surveillance to protect herd health.",
        icon: BadgeCheck,
      },
      {
        title: "Documented assurance",
        body: "Health and handling documentation, traceability identifiers, and clear expectations for receiving farms.",
        icon: FileText,
      },
      {
        title: "Professional management",
        body: "Standard operating cadence, trained staff, and transparent processes designed for reliability.",
        icon: Settings,
      },
      {
        title: "Quality control",
        body: "Quality-focused production and handling practices that prioritize animal welfare, hygiene, and consistency.",
        icon: ShieldCheck,
      },
      {
        title: "Reliable supply",
        body: "Operational discipline and planning to support predictable deliveries for farms and B2B buyers.",
        icon: Truck,
      },
    ],
    productTiles: [
      {
        title: "Breeding Stock (Parent Gilts)",
        body: "High-performing parent gilts designed for strong maternal traits and consistent outcomes.",
        imagery: {
          src: "/images/breedfeed.webp",
          alt: "breedStock",
        },
        href: "/breeding-stock",
        cta: "Request Gilts",
      },
      {
        title: "Premium Pork (B2B)",
        body: "B2B supply for slaughterhouses, bulk off-takers, supermarkets, hotels, restaurants, and institutions.",
        imagery: {
          src: "/images/b2b.jpg",
          alt: "breedStock",
        },
        href: "/premium-pork",
        cta: "Request Supply Quote",
      },
    ],
  },
  breedingStock: {
    headline: "Breeding Stock: Parent Gilts",
    intro:
      "Wills Farms supplies high-performance parent gilts (CG36 and Adenia) backed by disciplined genetics, health assurance, and a practical documentation pack to support receiving farms.",
    products: [
      {
        name: "CG36 Parent Gilts",
        image: {
          src: "/images/c3b6.webp",
          alt: "cg36",
        },
        bullets: [
          "Strong maternal performance with consistent litter size and good piglet survival rates",
          "Verified health and vaccination status with full traceability from source farm",
          "Reliable growth efficiency and adaptability across different housing and feeding systems",
        ],
      },
      {
        name: "Adenia Parent Gilts",
        image: {
          src: "/images/adenia.webp",
          alt: "adenia",
        },
        bullets: [
          "Selected for high fertility, strong mothering ability, and uniform litter quality",
          "Comprehensive health documentation with handling, acclimatization, and biosecurity guidance",
          "Reliable supplier support with clear delivery terms, replacement policy, and post-delivery assistance",
        ],
      },
    ],
    howToBuy: {
      title: "How to Buy",
      channels: [
        {
          name: "Wills Farms Direct",
          body: "Direct sales in Ghana and selected strategic accounts. Use the Request Gilts form to confirm availability and delivery scheduling.",
        },
        {
          name: "E-zootech (Axiom Africa representative)",
          body: "West Africa commercial coverage for gilts (in addition to Wills direct sales). We can connect qualified buyers to the appropriate channel.",
        },
      ],
    },
    documentationPack: [
      "Health & vaccination records (batch-specific where applicable)",
      "Handling and acclimation guidance",
      "Receiving-farm biosecurity requirements",
      "Claims policy overview (scope and timelines)",
      "Traceability identifiers and delivery documentation",
    ],
    faq: [
      {
        q: "What is the typical ordering timeline?",
        a: "Timing depends on availability and scheduling. Submit an inquiry with your preferred delivery window; we will confirm allocations and logistics.",
      },
      {
        q: "How does delivery work?",
        a: "We agree on delivery date and receiving requirements in advance. Buyers must prepare the receiving area and adhere to biosecurity protocols.",
      },
      {
        q: "What biosecurity is required at the receiving farm?",
        a: "At minimum: controlled access, clean pens, separation from existing stock as advised, and compliance with handling guidance provided in the documentation pack.",
      },
      {
        q: "What are the payment terms?",
        a: "A deposit is typically required to confirm allocations. Final terms are shared during booking and reflected on the pro forma invoice.",
      },
      {
        q: "What is the claims process?",
        a: "Claims are reviewed against delivery documentation, timelines, and agreed conditions. A clear overview is included in the documentation pack.",
      },
    ],
    productSheet: {
      label: "Download product sheet (PDF)",
      href: "#", // Replace with a real file once available
      note: "Placeholder link — upload your final PDF product sheet to /public/downloads and update this href.",
    },
  },
  premiumPork: {
    headline: "Premium Pork Supply (B2B Only)",
    intro:
      "Wills Farms supplies premium pork to institutional and commercial buyers who require consistent supply, uniform quality, and disciplined hygiene and biosecurity practices.",
    segments: [
      "Slaughterhouses",
      "Large buyers / bulk off-takers (processors, wholesalers)",
      "Supermarkets",
      "Hotels",
      "Restaurants",
      "Institutions (schools, hospitals, catering companies, government/agency procurement where applicable)",
    ],
    valueProps: [
      {
        title: "Consistent supply planning and delivery discipline",
        body: "We align on volumes, cadence, and delivery requirements upfront to reduce operational uncertainty.",
        icon: Truck,
      },
      {
        title: "Uniformity and quality-focused production practices",
        body: "Our production processes ensure consistent quality across every batch, meeting premium B2B standards.",
        icon: Layers,
      },
      {
        title: "Hygiene and biosecurity discipline across operations",
        body: "Strict hygiene and biosecurity protocols protect livestock health and ensure product safety.",
        icon: Shield,
      },
      {
        title: "Traceability identifiers and delivery documentation",
        body: "Every shipment comes with full traceability, health records, and documentation for accountability.",
        icon: FileText,
      },
      {
        title:
          "Dependable logistics coordination (cold-chain where applicable)",
        body: "We manage logistics with precision, including cold-chain handling, to guarantee product integrity.",
        icon: CalendarCheck,
      },
    ],
    formats: [
      {
        title: "Live pigs",
        image: {
          src: "/images/livepig.jpg",
          alt: "adenia",
        },
        body: "Primary supply format available now. Suitable for slaughterhouses and processors with established handling capacity.",
      },
      {
        title: "Other formats (by arrangement)",
        image: {
          src: "/images/b2b.jpg",
          alt: "adenia",
        },
        body: "Carcass, primal or bulk cuts may be available through partner processing arrangements. Confirm requirements via the inquiry form.",
      },
    ],
  },
  biosecurityQuality: {
    headline: "Biosecurity & Quality",
    intro:
      "Biosecurity is a core advantage at Wills Farms. Our protocols are designed to protect herd health, support predictable performance, and maintain a quality-focused operation.",
    biosecurity: [
      "Controlled site access and visitor management",
      "Quarantine and controlled animal movement",
      "Hygiene routines and disinfection points",
      "Standard operating procedures (SOPs) and staff training",
      "Ongoing monitoring and surveillance",
      "Traceability and documentation discipline",
    ],
    quality: [
      "Quality-focused production and handling practices",
      "HACCP-aligned approach where applicable (not a certification claim)",
      "Clear documentation and buyer communication",
      "Continuous improvement mindset and management reviews",
    ],
    charter: {
      label: "Download Quality Commitment Charter (PDF)",
      href: "#",
      note: "Placeholder link — upload your charter PDF to /public/downloads and update this href.",
    },
  },
  services: {
    headline: "Our Services",
    intro:
      "A genetics-led operating model designed to deliver consistent breeding stock performance and reliable B2B pork supply.",
    steps: [
      {
        title: "Genetics discipline",
        body: "Structured breeding program anchored on performance and health.",
      },
      {
        title: "Company-owned production",
        body: "Controlled production environments with professional SOPs and biosecurity.",
      },
      {
        title: "Processing & cold chain",
        body: "Logistics coordination and cold-chain planning where applicable.",
      },
      {
        title: "Branded distribution",
        body: "Supply to qualified B2B buyers through disciplined order and delivery processes.",
      },
    ],
  },
  partners: {
    headline: "Partners & Network",
    intro:
      "Wills Farms is powered by Axiom Genetics (France) and participates in the E-zootech Genetics network, strengthening genetics discipline, commercial coverage, and operational support.",
    roles: [
      {
        name: "Axiom Genetics, France",
        body: "Genetics partner providing technical direction and genetic program alignment.",
        image: "/brand/axiom.svg",
      },
      {
        name: "E-zootech Genetics network",
        body: "Network collaboration supporting regional market reach, knowledge-sharing, and coordinated growth.",
        image: "/brand/e-zootech.svg",
      },
      // {
      //   name: "E-zootech (Axiom Africa representative)",
      //   body: "West Africa commercial coverage for gilts (in addition to Wills direct sales). Buyers can access suitable channel support based on geography and account profile.",
      //   image: "",
      // },
    ],
  },
  careers: {
    headline: "Careers",
    intro:
      "Join a professional agribusiness built on discipline, biosecurity, and measurable performance. We hire people who value quality, integrity, and continuous improvement.",
    howToApply:
      "Send your CV and a short cover note indicating the role you are applying for to info@willsfarms.com. Include your location and availability.",
    openings: [
      {
        title: "Farm Operations Technician (Talent Pool)",
        location: "Eastern Region, Ghana",
        type: "Full-time",
        summary:
          "Support daily animal care, records, hygiene routines, and SOP adherence under supervision of the farm manager.",
      },
      {
        title: "Quality & Biosecurity Assistant (Talent Pool)",
        location: "Eastern Region, Ghana",
        type: "Full-time",
        summary:
          "Support compliance checks, hygiene routines, visitor control, and documentation discipline across operations.",
      },
    ],
  },
  news: {
    headline: "News & Insights",
    intro:
      "Updates and practical insights on genetics-led production, farm management, and disciplined biosecurity in modern pork value chains.",
    posts: [
      {
        slug: "biosecurity-basics-for-receiving-farms",
        title: "Biosecurity basics for receiving farms",
        date: "2026-01-01",
        excerpt:
          "A practical checklist for preparing your farm to receive breeding stock—focused on simple steps that reduce risk.",
        content: [
          "Receiving animals is a high-risk moment for herd health. A few practical steps can materially reduce the risk of disease introduction.",
          "Prepare a clean receiving pen, control access, and ensure staff follow hygiene routines. Keep new arrivals separated as advised and track documentation carefully.",
          "If you need support interpreting your documentation pack or receiving guidance, contact Wills Farms for assistance.",
        ],
      },
      {
        slug: "why-documentation-matters-in-breeding-stock",
        title: "Why documentation matters in breeding stock",
        date: "2026-01-01",
        excerpt:
          "Documentation is not paperwork—it is a management tool that protects outcomes and reduces disputes.",
        content: [
          "Consistent outcomes require more than good animals. Documentation supports traceability, clarity of handling, and alignment between supplier and receiving farm.",
          "Keep records of delivery, acclimation, and any issues observed in the first days after arrival. This improves decision-making and supports fair resolution if claims arise.",
        ],
      },
    ],
  },
  brochure: {
    label: "Download product line brochure (PDF)",
    href: "#",
    note: "Placeholder link — upload your brochure to /public/downloads and update this href.",
  },
  seo: {
    siteUrl: "https://www.willsfarms.com", // Update after you set your live domain
    title:
      "Wills Farms Ltd | Breeding Stock (Parent Gilts) & Premium Pork (B2B)",
    description:
      "Wills Farms Ltd is a genetics-led, vertically integrated pork company powered by Axiom Genetics (France). We supply high-performance parent gilts and premium pork to B2B buyers with strict biosecurity and professional management systems.",
    ogImage: "/brand/willsfarms-logo.png",
  },
} as const;
