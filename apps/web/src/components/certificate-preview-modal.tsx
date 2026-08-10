"use client";
import { Download, ExternalLink } from "lucide-react";
import type { Candidate } from "@pathey/types";
import { Button } from "@pathey/ui";
import { downloadAdmin } from "@/lib/api";

// Shared by the cycle workspace and the Candidates page so both preview
// modals behave identically. The iframe uses a blob: URL (an admin preview
// needs a Bearer-token fetch first, which a plain iframe src can't attach),
// and WebKit/Safari — especially iOS Safari — has a long-standing history of
// rendering blob: URLs inside an <iframe> unreliably (sometimes just blank).
// Opening the same blob directly in a new tab always works there, so the
// fallback link is a guaranteed working path rather than a decorative extra.
export function CertificatePreviewModal({
  candidate,
  previewUrl,
  previewError,
  onClose,
}: {
  candidate: Candidate;
  previewUrl: string | null;
  previewError: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal--wide" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Certificate preview</h2>
        <p>
          <strong>{candidate.nameHindi || candidate.nameEnglish}</strong>{" "}
          · {candidate.certificateNumber}
        </p>
        {previewError ? (
          <p className="notice notice-danger">{previewError}</p>
        ) : previewUrl ? (
          <>
            <iframe className="pdf-frame" title="Certificate preview" src={previewUrl} />
            <p style={{ marginTop: 8, fontSize: 13 }}>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)" }}
              >
                <ExternalLink size={14} aria-hidden /> Preview not showing? Open in a new tab
              </a>
            </p>
          </>
        ) : (
          <p>Loading preview…</p>
        )}
        <div className="actions" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={!previewUrl}
            onClick={() =>
              downloadAdmin(
                `/admin/candidates/${candidate.id}/certificate-preview`,
                `${candidate.certificateNumber}.pdf`,
              )
            }
          >
            <Download size={18} />
            Download certificate
          </Button>
        </div>
      </div>
    </div>
  );
}
