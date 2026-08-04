import { redirect } from "next/navigation";

export default async function LegacyCertificatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  redirect(`/certificate/${(await params).slug}`);
}
