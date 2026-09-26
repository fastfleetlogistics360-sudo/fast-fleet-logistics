import type { Metadata } from "next";
import { MyCases } from "@/components/support/my-cases";
export const metadata: Metadata = { title: "My Support Cases" };
export default function SupportCasesPage() { return <MyCases />; }
