type WhatsAppAccountConfirmationEmailInput = {
  to: string;
  customerName?: string | null;
  code: string;
  whatsappPhone: string;
};

/** Sends the independently branded email used only to confirm a WhatsApp account link. */
export async function sendWhatsAppAccountConfirmationEmail(input: WhatsAppAccountConfirmationEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("WhatsApp email confirmation is unavailable because RESEND_API_KEY is not configured.");

  const from = process.env.FASTFLEET_EMAIL_FROM?.trim() || "FastFleets 360 <onboarding@resend.dev>";
  const recipientName = firstName(input.customerName);
  const maskedPhone = maskPhone(input.whatsappPhone);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: "Confirm your WhatsApp account",
      text: textBody({ recipientName, code: input.code, maskedPhone }),
      html: htmlBody({ recipientName, code: input.code, maskedPhone })
    }),
    signal: AbortSignal.timeout(12_000)
  }).catch(() => null);

  if (!response?.ok) {
    const payload = await response?.json().catch(() => ({}));
    throw new Error(String((payload as { message?: string })?.message || "FastFleets could not send the confirmation email."));
  }
}

function textBody(input: { recipientName: string; code: string; maskedPhone: string }) {
  return [
    "FASTFLEETS 360",
    "",
    "Confirm your WhatsApp account",
    "",
    `Hello ${input.recipientName},`,
    "",
    `We received a request to connect ${input.maskedPhone} to your FastFleets 360 account.`,
    "",
    `Your confirmation code: ${input.code}`,
    "",
    "Reply with this six-digit code in your current WhatsApp conversation with FastFleets 360. It expires in 10 minutes and can be used once.",
    "",
    "For your security, FastFleets 360 will never ask for your password, card PIN, or confirmation code outside this process.",
    "",
    "If you did not request this, you can safely ignore this email.",
    "",
    "© FastFleets 360 Logistics · Secure account services"
  ].join("\n");
}

function htmlBody(input: { recipientName: string; code: string; maskedPhone: string }) {
  const name = escapeHtml(input.recipientName);
  const phone = escapeHtml(input.maskedPhone);
  const code = escapeHtml(input.code.slice(0, 3) + " " + input.code.slice(3));
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#10213b">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your secure FastFleets 360 WhatsApp confirmation code is inside.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:36px 14px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(16,33,59,.09)">
          <tr><td style="background:#10213b;padding:26px 36px;color:#ffffff">
            <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#f8a31a">FASTFLEETS 360</div>
            <div style="margin-top:8px;font-size:22px;font-weight:800">Secure account services</div>
          </td></tr>
          <tr><td style="padding:38px 36px 30px">
            <div style="font-size:13px;font-weight:800;letter-spacing:1.5px;color:#bf6710">WHATSAPP ACCOUNT CONFIRMATION</div>
            <h1 style="margin:12px 0 14px;font-size:31px;line-height:1.18;color:#10213b">Confirm your WhatsApp account</h1>
            <p style="margin:0;font-size:16px;line-height:1.65;color:#4d607d">Hello ${name},</p>
            <p style="margin:14px 0 0;font-size:16px;line-height:1.65;color:#4d607d">We received a request to connect <strong style="color:#10213b">${phone}</strong> to your FastFleets 360 account.</p>
            <div style="margin:28px 0 22px;padding:22px 18px;border:1px solid #d9e4f0;border-radius:14px;background:#f8fbff;text-align:center">
              <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;color:#697b95">YOUR CONFIRMATION CODE</div>
              <div style="margin-top:10px;font-size:36px;font-weight:800;letter-spacing:8px;color:#10213b">${code}</div>
            </div>
            <p style="margin:0;font-size:15px;line-height:1.65;color:#4d607d">Reply with this six-digit code in your current WhatsApp conversation with FastFleets 360. It expires in <strong style="color:#10213b">10 minutes</strong> and can be used once.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:26px;border-radius:12px;background:#fff8e7"><tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#775314"><strong>Keep your account secure.</strong><br/>We will never ask for your password, card PIN, or this code outside this confirmation process.</td></tr></table>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#697b95">If you did not make this request, you can safely ignore this email. No action is required.</p>
          </td></tr>
          <tr><td style="border-top:1px solid #e7edf4;padding:22px 36px;font-size:12px;line-height:1.5;color:#7a8ba2">© FastFleets 360 Logistics · Secure account services</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function maskPhone(phone: string) {
  const compact = phone.replace(/\s+/g, "");
  if (compact.length < 5) return "your WhatsApp number";
  return `${compact.slice(0, 4)} •••• ${compact.slice(-4)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}
