export default function AdminLoading() {
  return (
    <div aria-live="polite" aria-busy="true">
      <div className="page-head">
        <div>
          <h1>Loading page…</h1>
          <p>Preparing the administration workspace.</p>
        </div>
      </div>
      <div className="card empty">Please wait a moment.</div>
    </div>
  );
}
