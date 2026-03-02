import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const data = await req.json();

    await resend.emails.send({
      from: `${data.fullName}  <onboarding@resend.dev>`,
      replyTo: data.email,
      to: "geraldsix89@gmail.com",
      subject: `New ${data.leadType.toUpperCase()} Lead Submission`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #fafafa;">
          
          <h2 style="color: #b91c1c; margin-bottom: 20px;">New Lead Submission</h2>
          
          <div style="margin-bottom: 20px; padding: 15px; background: #fff; border-radius: 6px; border: 1px solid #eee;">
            <h3 style="margin-top: 0; color: #555;">User Info</h3>
            <p><strong>Full Name:</strong> ${data.fullName}</p>
            <p><strong>Email:</strong> ${data.email}</p>
            <p><strong>Company / Farm:</strong> ${data.company}</p>
            <p><strong>Location / Delivery Area:</strong> ${data.location}</p>
          </div>

          <div style="margin-bottom: 20px; padding: 15px; background: #fff; border-radius: 6px; border: 1px solid #eee;">
            <h3 style="margin-top: 0; color: #555;">Lead Details</h3>
            <p><strong>Lead Type:</strong> ${data.leadType}</p>
            ${
              data.leadType === "pork"
                ? `
            <p><strong>Buyer Type:</strong> ${data.buyerType}</p>
            <p><strong>Product Format:</strong> ${data.productFormat}</p>
            <p><strong>Estimated Volume:</strong> ${data.estimatedVolume}</p>
            <p><strong>Supply Frequency:</strong> ${data.supplyFrequency}</p>
            <p><strong>Start Date:</strong> ${data.startDate}</p>
            <p><strong>Delivery Location:</strong> ${data.deliveryLocation}</p>
            <p><strong>Cold-Chain Requirement:</strong> ${data.coldChain}</p>
            `
                : `
            <p><strong>Requested Quantity:</strong> ${data.giltQuantity}</p>
            <p><strong>Type of Gilt:</strong> ${data.giltType || "N/A"}</p>
            <p><strong>Preferred Delivery Window:</strong> ${
              data.deliveryWindow
            }</p>
            <p><strong>Receiving Farm Readiness:</strong> ${
              data.biosecurityReadiness || "N/A"
            }</p>
            `
            }
          </div>

          <div style="padding: 15px; background: #fff; border-radius: 6px; border: 1px solid #eee;">
            <h3 style="margin-top: 0; color: #555;">Notes / Requirements</h3>
            <p>${data.notes || "N/A"}</p>
          </div>

          <p style="margin-top: 20px; font-size: 12px; color: #999;">
            This email was sent from the lead capture form. Replying will go directly to the user.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead email error:", error);
    return NextResponse.json({ error: "Failed to send lead" }, { status: 500 });
  }
}
