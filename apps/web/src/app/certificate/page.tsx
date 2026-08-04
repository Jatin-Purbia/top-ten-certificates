import type { Metadata } from "next";
import { ClaimPortal } from "@/components/claim-portal";

export const metadata: Metadata = {
  title: "Certificate Portal",
  description: "Public certificate access for Pathye Kan quiz candidates.",
};

export default function CertificateHome() {
  return <ClaimPortal />;
}
