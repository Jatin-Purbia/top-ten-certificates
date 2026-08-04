const webOrigin = "http://127.0.0.1:3000";
const apiOrigin = "http://127.0.0.1:4000/api/v1";
const adminHeaders = { "x-demo-admin": "demo-super-admin" };

const waitFor = async (url, options = {}) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

try {
  const cyclesResponse = await Promise.all([
    waitFor(`${webOrigin}/admin/login`),
    waitFor(`${apiOrigin}/admin/cycles?pageSize=100`, { headers: adminHeaders }),
  ]).then((responses) => responses[1]);
  const cycles = await cyclesResponse.json();
  const firstCycle =
    cycles.data?.find((cycle) => cycle.status === "published") ?? cycles.data?.[0];
  const routes = [
    "/admin",
    "/admin/cycles",
    "/admin/candidates",
    "/admin/templates",
    "/admin/settings",
    "/admin/audit",
    "/certificate",
    ...(firstCycle ? [`/admin/cycles/${firstCycle.id}`] : []),
    ...(firstCycle ? [`/certificate/${firstCycle.publicSlug}`] : []),
  ];
  for (const route of routes) {
    const response = await fetch(`${webOrigin}${route}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${route} returned ${response.status}`);
  }
  console.log(`Development routes warmed (${routes.length + 1} pages).`);
} catch (error) {
  console.warn(`Development warm-up skipped: ${error.message}`);
}
