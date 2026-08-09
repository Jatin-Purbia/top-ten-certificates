import type { Metadata } from "next";
import { ClaimPortal } from "@/components/claim-portal";

export const metadata: Metadata = {
  title: "Certificate Portal",
  description: "Verify and download your personalised certificate.",
};

export default function Home() {
  // Minor edit: no functional change — timestamp for redeploy trigger
  return <ClaimPortal />;
}
