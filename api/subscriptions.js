// Serverless function: securely reads and writes the Airtable "Subscriptions Tracker" base.
// AIRTABLE_TOKEN stays server-side and needs data.records:read plus data.records:write access.

import { parseJsonBody, requireAuth, requireSameOrigin } from "./_auth.js";

const BASE_ID = "appVb7YfkeSMmmTeR";
const SUBSCRIPTIONS_TABLE_ID = "tbl4H5Yhkow25EAio";
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${SUBSCRIPTIONS_TABLE_ID}`;
const CATEGORIES = new Set([
  "AI",
  "Productivity",
  "Health",
  "Entertainment",
  "Music",
  "Family",
  "Cloud",
  "Other",
  "Photography",
  "Transport",
]);
const STATUSES = new Set(["Active", "Paused"]);
const CYCLES = new Set(["Monthly", "Yearly"]);

async function airtableRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`Airtable request failed (${response.status}):`, detail.slice(0, 500));
    const error = new Error("Airtable could not complete the request.");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchSubscriptions(token) {
  let records = [];
  let offset;
  do {
    const url = new URL(AIRTABLE_URL);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const payload = await airtableRequest(token, url);
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
    if (!existing || String(record.createdTime || "") > String(existing.createdTime || "")) newest.set(key, record);
  });
  return [...newest.values()];
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRecord(record) {
  const fields = record.fields || {};
  const rawStatus = selectName(fields.Status, "Active");
  return {
    id: record.id,
    name: String(fields.Name || "").trim(),
    category: selectName(fields.Category, "Other"),
    status: rawStatus === "Active" ? "Active" : "Paused",
    cycle: selectName(fields.Cycle, "Yearly"),
    monthly: numberOrZero(fields["Cost Monthly (CHF)"]),
    yearly: numberOrZero(fields["Cost Yearly (CHF)"]),
    paidVia: String(fields["Paid Via"] || "").trim(),
    notes: String(fields.Notes || "").trim(),
  };
}

function cleanText(value, field, maximum, required = false) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error(`${field} is required.`);
  if (cleaned.length > maximum) throw new Error(`${field} is too long.`);
  return cleaned;
}

function cleanNumber(value, field) {
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000) {
    throw new Error(`${field} must be between 0 and 100,000.`);
  }
  return Math.round(number * 100) / 100;
}

function validateSubscription(body) {
  const item = {
    name: cleanText(body.name, "Name", 120, true),
    category: cleanText(body.category, "Category", 40, true),
    status: cleanText(body.status, "Status", 20, true),
    cycle: cleanText(body.cycle, "Cycle", 20, true),
    monthly: cleanNumber(body.monthly, "Monthly cost"),
    yearly: cleanNumber(body.yearly, "Yearly cost"),
    paidVia: cleanText(body.paidVia || "", "Paid via", 120),
    notes: cleanText(body.notes || "", "Notes", 2000),
  };
  if (!CATEGORIES.has(item.category)) throw new Error("Choose a valid category.");
  if (!STATUSES.has(item.status)) throw new Error("Status must be Active or Paused.");
  if (!CYCLES.has(item.cycle)) throw new Error("Choose a valid billing cycle.");
  return item;
}

function airtableFields(item) {
  return {
    Name: item.name,
    Category: item.category,
    Status: item.status,
    Cycle: item.cycle,
    "Cost Monthly (CHF)": item.monthly,
    "Cost Yearly (CHF)": item.yearly,
    "Paid Via": item.paidVia,
    Notes: item.notes,
  };
}

function duplicateExists(records, name, ignoredId = "") {
  const key = name.toLocaleLowerCase("en");
  return records.some(
    (record) => record.id !== ignoredId && String(record.fields?.Name || "").trim().toLocaleLowerCase("en") === key,
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET" && !requireSameOrigin(req, res)) return;

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    res.status(503).json({ error: "Airtable is not configured yet." });
    return;
  }

  try {
    const rawSubscriptions = await fetchSubscriptions(token);
    const uniqueSubscriptions = dedupeNewestByName(rawSubscriptions);

    if (req.method === "GET") {
      const subscriptions = uniqueSubscriptions.map(normalizeRecord).filter((item) => item.name);
      res.status(200).json({
        subscriptions,
        meta: {
          source: "Airtable",
          rawSubscriptionCount: rawSubscriptions.length,
          uniqueSubscriptionCount: subscriptions.length,
          duplicateSubscriptionCount: rawSubscriptions.length - subscriptions.length,
        },
      });
      return;
    }

    let body;
    try {
      body = parseJsonBody(req);
    } catch {
      res.status(400).json({ error: "Invalid request." });
      return;
    }

    let item;
    try {
      item = validateSubscription(body);
    } catch (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (req.method === "POST") {
      if (duplicateExists(rawSubscriptions, item.name)) {
        res.status(409).json({ error: "A subscription with this name already exists." });
        return;
      }
      const created = await airtableRequest(token, AIRTABLE_URL, {
        method: "POST",
        body: JSON.stringify({ fields: airtableFields(item), typecast: false }),
      });
      res.status(201).json({ ok: true, id: created.id });
      return;
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) {
      res.status(400).json({ error: "Invalid subscription ID." });
      return;
    }
    const currentRecord = rawSubscriptions.find((record) => record.id === id);
    if (!currentRecord) {
      res.status(404).json({ error: "Subscription not found." });
      return;
    }
    const currentName = String(currentRecord.fields?.Name || "").trim().toLocaleLowerCase("en");
    const nameChanged = item.name.toLocaleLowerCase("en") !== currentName;
    if (nameChanged && duplicateExists(rawSubscriptions, item.name, id)) {
      res.status(409).json({ error: "A subscription with this name already exists." });
      return;
    }
    const updated = await airtableRequest(token, `${AIRTABLE_URL}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: airtableFields(item), typecast: false }),
    });
    res.status(200).json({ ok: true, id: updated.id });
  } catch (error) {
    const status = error.status === 401 || error.status === 403 ? 502 : 500;
    res.status(status).json({ error: "Subscriptions could not be loaded from Airtable." });
  }
}
