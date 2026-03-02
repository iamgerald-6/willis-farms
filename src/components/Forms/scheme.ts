import { z } from "zod";

export const leadSchema = z.object({
  leadType: z.enum(["gilts", "pork"]),

  fullName: z.string().min(2),
  company: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email(),
  location: z.string().min(2),

  // Gilts
  giltQuantity: z.string().optional(),
  deliveryWindow: z.string().optional(),
  biosecurityReadiness: z.string().optional(),

  // Pork
  buyerType: z.string().optional(),
  productFormat: z.string().optional(),
  estimatedVolume: z.string().optional(),
  supplyFrequency: z.string().optional(),
  startDate: z.string().optional(),
  deliveryLocation: z.string().optional(),
  coldChain: z.enum(["yes", "no"]).optional(),
  notes: z.string().optional(),
  // Honeypot
  company_website: z.string().optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;
