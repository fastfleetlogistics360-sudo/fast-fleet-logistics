# FastFleets 360 Auth Email Templates

Apply these in **Supabase Dashboard → Authentication → Email Templates**. They are not stored or deployed by the website itself.

Before saving, make sure **Authentication → URL Configuration → Site URL** is your production site and add both of these Redirect URLs:

- `https://fastfleet.com.ng/auth/callback`
- `https://fastfleet.com.ng/auth/confirm`

Also add matching URLs for preview/staging only if those environments are intentionally used.

## Confirm signup

**Subject:** Confirm your FastFleets 360 account

Use this HTML. Keep `{{ .ConfirmationURL }}` exactly as written: it preserves the same-browser sign-in handoff. If the link is opened in another browser, the website now shows a successful-account message and asks the customer to sign in.

```html
<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#10213b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 14px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(16,33,59,.09)"><tr><td style="background:#10213b;padding:28px 36px;color:#fff"><div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#f8a31a">FASTFLEETS 360</div><div style="margin-top:8px;font-size:22px;font-weight:800">Secure account access</div></td></tr><tr><td style="padding:38px 36px"><div style="font-size:12px;font-weight:800;letter-spacing:1.5px;color:#bf6710">WELCOME</div><h1 style="margin:12px 0 14px;font-size:30px;line-height:1.2">Confirm your email</h1><p style="font-size:16px;line-height:1.65;color:#4d607d">Thanks for creating your FastFleets 360 account. Confirm your email to activate your login.</p><p style="margin:28px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;border-radius:10px;background:#10213b;padding:14px 20px;color:#fff;font-size:15px;font-weight:800;text-decoration:none">Verify my email</a></p><p style="font-size:13px;line-height:1.6;color:#697b95">If you did not create this account, you can safely ignore this email. We will never ask for your password, card PIN, or bank details by email.</p></td></tr><tr><td style="border-top:1px solid #e7edf4;padding:20px 36px;font-size:12px;color:#7a8ba2">© FastFleets 360 Logistics · Secure account services</td></tr></table></td></tr></table></body></html>
```

## Reset password

**Subject:** Reset your FastFleets 360 password

Use this HTML. Keep the `token_hash` and `type=recovery` values exactly as shown. This intentionally opens the website's secure recovery handler, so the reset link works when opened on a different device or browser.

```html
<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#10213b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 14px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(16,33,59,.09)"><tr><td style="background:#10213b;padding:28px 36px;color:#fff"><div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#f8a31a">FASTFLEETS 360</div><div style="margin-top:8px;font-size:22px;font-weight:800">Secure account access</div></td></tr><tr><td style="padding:38px 36px"><div style="font-size:12px;font-weight:800;letter-spacing:1.5px;color:#bf6710">PASSWORD RESET</div><h1 style="margin:12px 0 14px;font-size:30px;line-height:1.2">Choose a new password</h1><p style="font-size:16px;line-height:1.65;color:#4d607d">We received a request to reset your FastFleets 360 password. Use the secure button below to choose a new one.</p><p style="margin:28px 0"><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery" style="display:inline-block;border-radius:10px;background:#10213b;padding:14px 20px;color:#fff;font-size:15px;font-weight:800;text-decoration:none">Reset my password</a></p><p style="font-size:13px;line-height:1.6;color:#697b95">If you did not request a password reset, you can safely ignore this email. This link is time-limited and can be used once.</p></td></tr><tr><td style="border-top:1px solid #e7edf4;padding:20px 36px;font-size:12px;color:#7a8ba2">© FastFleets 360 Logistics · Secure account services</td></tr></table></td></tr></table></body></html>
```
