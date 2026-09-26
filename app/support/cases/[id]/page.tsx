import type { Metadata } from "next";
import { CaseConversation } from "@/components/support/case-conversation";
export const metadata: Metadata = { title: "Support Case" };
export default async function SupportCasePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <CaseConversation caseId={id} />; }
