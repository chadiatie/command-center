// Serverless function: reads the Airtable "Catalog" table and returns JSON.
// The Airtable token is read from the AIRTABLE_TOKEN environment variable (set in Vercel),
// so it never ships to the browser.

const BASE_ID = "appCBSnJWqjz2xF6l";
const TABLE_ID = "tblO5cZT7uFv8aYKP";

export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    res.status(500).json({ error: "Missing AIRTABLE_TOKEN env var" });
    return;
  }

  try {
    let records = [];
    let offset;
    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Airtable responded ${r.status}`);
      const j = await r.json();
      records = records.concat(j.records || []);
      offset = j.offset;
    } while (offset);

    const items = records
      .map((rec) => {
        const f = rec.fields || {};
        return {
          name: f["Name"],
          url: f["URL"],
          domain: f["Domain"] || "",
          mode: f["Mode"] || "Tools",
          section: f["Section"] || "",
          category: f["Category"] || "",
          logo: f["Logo Override"] || "",
          sort: typeof f["Sort"] === "number" ? f["Sort"] : 999999,
          status: f["Status"] || "",
          daily: !!f["Daily Driver"],
          cost: f["Cost"] || "",
        };
      })
      .filter((x) => x.name && x.url && x.status !== "Archived");

    // CDN cache: serve cached for 60s, revalidate in background up to 5 min.
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
