type InvestorInvitationEmail = {
  to: string;
  fullName: string;
  investorCode: string;
  activationUrl: string;
  existingAccount: boolean;
  purpose?: "activation" | "password_reset";
};

/**
 * Sends the Investor Programme message ourselves rather than sending a
 * consumable Supabase confirmation URL. The recipient must explicitly confirm
 * on our activation screen, which prevents mail scanners from spending it.
 */
export async function sendInvestorInvitationEmail(input: InvestorInvitationEmail) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Investor invitations require RESEND_API_KEY to be configured.");
  const from = process.env.FASTFLEET_EMAIL_FROM?.trim() || "FastFleets 360 <onboarding@resend.dev>";
  const firstName = input.fullName.trim().split(/\s+/)[0] || "there";
  const passwordReset = input.purpose === "password_reset";
  const action = passwordReset ? "Set a new password" : input.existingAccount ? "Open your Investor Programme access" : "Activate your Investor account";
  const accountText = passwordReset
    ? "Use the secure page to choose a new password for your FastFleets Investor Programme access."
    : input.existingAccount
      ? "Your existing FastFleets sign-in stays exactly as it is. After confirmation, you can use the same account to view your investor assets."
      : "You will create your own password and confirm your payout account during the secure activation steps.";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: passwordReset ? "Reset your FastFleets 360 Investor Programme password" : "Welcome to the FastFleets 360 Investor Programme",
      text: [
        "FASTFLEETS 360 INVESTOR PROGRAMME",
        "",
        `Hello ${firstName},`,
        "",
        passwordReset ? "We received a request to reset your Investor Programme password." : "You have been invited to securely monitor the bicycle assets assigned to you through FastFleets 360.",
        `Investor reference: ${input.investorCode}`,
        "",
        accountText,
        "",
        `${action}: ${input.activationUrl}`,
        "",
        "For your security, this link opens a confirmation screen before activation. We will never ask for your password, card PIN, or bank details by email.",
        "",
        "If you were not expecting this invitation, you can safely ignore this email or contact FastFleets 360 support.",
        "",
        "© FastFleets 360 Logistics · Investor Programme"
      ].join("\n"),
      html: html({ firstName, code: input.investorCode, activationUrl: input.activationUrl, action, accountText, passwordReset })
    }),
    signal: AbortSignal.timeout(12_000)
  }).catch(() => null);
  if (!response?.ok) {
    const payload = await response?.json().catch(() => ({}));
    throw new Error(String((payload as { message?: string }).message || "FastFleets could not send the Investor Programme email."));
  }
}

function html(input: { firstName: string; code: string; activationUrl: string; action: string; accountText: string; passwordReset: boolean }) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
  const introduction = input.passwordReset ? "We received a request to reset your Investor Programme password." : "You have been invited to securely monitor the bicycle assets assigned to you through FastFleets 360.";
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#10213b"><div style="display:none;max-height:0;overflow:hidden">Your secure FastFleets 360 Investor Programme ${input.passwordReset ? "password reset" : "invitation"} is ready.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 14px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(16,33,59,.09)"><tr><td style="background:#10213b;padding:28px 36px;color:#fff"><div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#f8a31a">FASTFLEETS 360</div><div style="margin-top:8px;font-size:22px;font-weight:800">Investor Programme</div></td></tr><tr><td style="padding:38px 36px"><div style="font-size:12px;font-weight:800;letter-spacing:1.5px;color:#bf6710">SECURE ASSET ACCESS</div><h1 style="margin:12px 0 14px;font-size:30px;line-height:1.2">Hello, ${escape(input.firstName)}</h1><p style="font-size:16px;line-height:1.65;color:#4d607d">${escape(introduction)}</p><div style="margin:24px 0;padding:16px 18px;border:1px solid #d9e4f0;border-radius:14px;background:#f8fbff"><div style="font-size:11px;font-weight:800;letter-spacing:1.3px;color:#697b95">INVESTOR REFERENCE</div><div style="margin-top:6px;font-size:21px;font-weight:800;color:#10213b">${escape(input.code)}</div></div><p style="font-size:15px;line-height:1.65;color:#4d607d">${escape(input.accountText)}</p><p style="margin:28px 0"><a href="${escape(input.activationUrl)}" style="display:inline-block;border-radius:10px;background:#10213b;padding:14px 20px;color:#fff;font-size:15px;font-weight:800;text-decoration:none">${escape(input.action)}</a></p><p style="font-size:13px;line-height:1.6;color:#697b95">For your security, this button opens a confirmation screen before activation. We will never ask for your password, card PIN, or bank details by email.</p><p style="font-size:13px;line-height:1.6;color:#697b95">If you were not expecting this ${input.passwordReset ? "request" : "invitation"}, you can safely ignore this email or contact FastFleets 360 support.</p></td></tr><tr><td style="border-top:1px solid #e7edf4;padding:20px 36px;font-size:12px;color:#7a8ba2">© FastFleets 360 Logistics · Investor Programme</td></tr></table></td></tr></table></body></html>`;
}
