import { ClaimPortal } from "@/components/claim-portal";

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <ClaimPortal slug={(await params).slug} />;
}
