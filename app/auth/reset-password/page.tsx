import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Create a New Password" };

export default function ResetPasswordPage() {
  return <section className="section-wrap flex min-h-[70vh] items-center py-8 sm:py-12"><ResetPasswordForm /></section>;
}
