// Serverless function: reads the Airtable "Subscriptions Tracker" base.
// AIRTABLE_TOKEN stays server-side in Vercel and must have read access to this base.

const BASE_ID = "appVb7YfkeSMmmTeR";
const SUBSCRIPTIONS_TABLE_ID = "tbl4H5Yhkow25EAio";
const WISHLIST_TABLE_ID = "tblCqK6M6PbCdDZl6";

async function fetchTable(token, tableId) {
  let records = [];
  let offset;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Airtable responded ${response.status}: ${detail}`);
    }

    const payload = await response.json();
    records = records.concat(payload.records || []);
    offset = payload.offset;
  } while (offset);

  return records;
}

function selectName(value, fallback = "") {
  if (typeof value === "string") return value;
  return value?.name || fallback;
}

function dedupeNewestByName(records) {
  const newest = new Map();

  records.forEach((record) => {
    const name = String(record.fields?.Name || "").trim();
    if (!name) return;

    const key = name.toLocaleLowerCase("en");
    const existing = newest.get(key);
    if (!existing || record.createdTime > existing.createdTime) {
      newest.set(key, record);
    }
  });

  return [...newest.values()];
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    res.status(500).json({ error: "Missing AIRTABLE_TOKEN env var" });
    return;
  }

  try {
    const [rawSubscriptions, rawWishlist] = await Promise.all([
      fetchTable(token, SUBSCRIPTIONS_TABLE_ID),
      fetchTable(token, WISHLIST_TABLE_ID),
    ]);

    const uniqueSubscriptions = dedupeNewestByName(rawSubscriptions);
    const subscriptions = uniqueSubscriptions
      .map((record) => {
        const fields = record.fields || {};
        return {
          id: record.id,
          name: String(fields.Name || "").trim(),
          category: selectName(fields.Category, "Other"),
          status: selectName(fields.Status, "Active"),
          cycle: selectName(fields.Cycle, "Yearly"),
          monthly: numberOrZero(fields["Cost Monthly (CHF)"]),
          yearly: numberOrZero(fields["Cost Yearly (CHF)"]),
          paidVia: String(fields["Paid Via"] || "").trim(),
          notes: String(fields.Notes || "").trim(),
        };
      })
      .filter((item) => item.name);

    const wishlist = dedupeNewestByName(rawWishlist)
      .map((record) => {
        const fields = record.fields || {};
        return {
          id: record.id,
          name: String(fields.Name || "").trim(),
          category: selectName(fields.Category, "Other"),
          estimatedCost: numberOrZero(fields["Estimated Cost (CHF)"]),
          notes: String(fields.Notes || "").trim(),
        };
      })
      .filter((item) => item.name);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({
      subscriptions,
      wishlist,
      meta: {
        source: "Airtable",
        rawSubscriptionCount: rawSubscriptions.length,
        uniqueSubscriptionCount: subscriptions.length,
        duplicateSubscriptionCount: rawSubscriptions.length - subscriptions.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
}

