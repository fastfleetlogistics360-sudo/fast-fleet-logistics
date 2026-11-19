import type { Metadata } from "next";
import { CustomerFastAi } from "@/components/fast-ai/customer-fast-ai";

export const metadata: Metadata = { title: "FAST AI | Fast Fleets 360" };
export default function FastAiPage() { return <CustomerFastAi />; }
