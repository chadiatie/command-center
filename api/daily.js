import { requireAuth } from "./_auth.js";

const TIME_ZONE = "Europe/Zurich";
const OUTLOOK_TIME_ZONE = "W. Europe Standard Time";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const AIRTABLE_BASE_ID = "appCBSnJWqjz2xF6l";
const AIRTABLE_TABLE_ID = "tblYigHKlN8xV4E3R";

function hasGraphConfig() {
  return [
    "MS_GRAPH_TENANT_ID",
    "MS_GRAPH_CLIENT_ID",
    "MS_GRAPH_CLIENT_SECRET",
    "MS_GRAPH_USER_ID",
  ].every((name) => Boolean(process.env[name]));
}

function zonedParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desired;
  for (let index = 0; index < 3; index += 1) {
    const actual = zonedParts(new Date(guess));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += desired - actualAsUtc;
  }
  return new Date(guess);
}

function todayBounds() {
  const today = zonedParts(new Date());
  const tomorrowUtcDate = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const tomorrow = {
    year: tomorrowUtcDate.getUTCFullYear(),
    month: tomorrowUtcDate.getUTCMonth() + 1,
    day: tomorrowUtcDate.getUTCDate(),
  };
  return {
    start: zonedTimeToUtc({ year: today.year, month: today.month, day: today.day }),
    end: zonedTimeToUtc(tomorrow),
  };
}

function atLocalTime(hour, minute) {
  const today = zonedParts(new Date());
  return zonedTimeToUtc({ year: today.year, month: today.month, day: today.day, hour, minute }).toISOString();
}

function samplePayload(reason = "Outlook is ready to connect") {
  return {
    mode: "sample",
    reason,
    refreshedAt: new Date().toISOString(),
    refreshIntervalMinutes: 5,
    calendar: [
      {
        id: "sample-focus",
        title: "Deep work: quarterly analytics review",
        start: atLocalTime(9, 0),
        end: atLocalTime(10, 30),
        location: "Focus block",
        isAllDay: false,
        isSample: true,
      },
      {
        id: "sample-team",
        title: "Weekly team sync",
        start: atLocalTime(11, 0),
        end: atLocalTime(11, 45),
        location: "Microsoft Teams",
        isAllDay: false,
        isSample: true,
      },
      {
        id: "sample-family",
        title: "Family admin",
        start: atLocalTime(18, 15),
        end: atLocalTime(18, 45),
        location: "Personal",
        isAllDay: false,
        isSample: true,
      },
    ],
    inbox: [
      {
        id: "sample-review",
        subject: "Weekly status — ready for your review",
        from: "Analytics team",
        receivedAt: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
        importance: "high",
        isRead: false,
        isSample: true,
      },
      {
        id: "sample-booking",
        subject: "Booking confirmation and next steps",
        from: "Travel service",
        receivedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        importance: "normal",
        isRead: false,
        isSample: true,
      },
      {
        id: "sample-renewal",
        subject: "Subscription renewal reminder",
        from: "Online service",
        receivedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        importance: "normal",
        isRead: false,
        isSample: true,
      },
    ],
  };
}

function selectName(value, fallback = "") {
  if (typeof value === "string") return value;
  return value?.name || fallback;
}

async function airtablePayload(token) {
  let records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Airtable daily brief returned ${response.status}`);
    const page = await response.json();
    records = records.concat(page.records || []);
    offset = page.offset;
  } while (offset);

  const latestBatch = records.reduce((latest, record) => {
    const syncedAt = String(record.fields?.["Synced At"] || "");
    return syncedAt > latest ? syncedAt : latest;
  }, "");
  if (!latestBatch) return null;

  const latest = records.filter((record) => record.fields?.["Synced At"] === latestBatch);
  const calendar = latest
    .filter((record) => selectName(record.fields?.Type) === "Calendar")
    .map((record) => ({
      id: record.fields.Key || record.id,
      title: record.fields.Title || "Untitled event",
      start: record.fields.Start || "",
      end: record.fields.End || "",
      location: record.fields.Meta || "Outlook calendar",
      isAllDay: false,
      url: record.fields.URL || "",
      isSample: false,
    }))
    .sort((left, right) => new Date(left.start) - new Date(right.start));

  const inbox = latest
    .filter((record) => selectName(record.fields?.Type) === "Inbox")
    .map((record) => ({
      id: record.fields.Key || record.id,
      subject: record.fields.Title || "No subject",
      from: record.fields.Meta || "Unknown sender",
      receivedAt: record.fields.Received || latestBatch,
      importance: selectName(record.fields.Importance, "Normal").toLowerCase(),
      isRead: selectName(record.fields?.["Read State"], "Unread") === "Read",
      url: record.fields.URL || "",
      isSample: false,
    }))
    .sort((left, right) => new Date(right.receivedAt) - new Date(left.receivedAt));

  return {
    mode: "live",
    source: "Outlook via Airtable",
    refreshedAt: latestBatch,
    refreshIntervalMinutes: 5,
    calendar,
    inbox,
  };
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.MS_GRAPH_CLIENT_ID,
    client_secret: process.env.MS_GRAPH_CLIENT_SECRET,
    scope: GRAPH_SCOPE,
    grant_type: "client_credentials",
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_GRAPH_TENANT_ID)}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  if (!response.ok) throw new Error(`Microsoft sign-in returned ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Microsoft sign-in did not return an access token");
  return payload.access_token;
}

async function graphRequest(token, path) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: `outlook.timezone=\"${OUTLOOK_TIME_ZONE}\"`,
    },
  });
  if (!response.ok) throw new Error(`Microsoft Graph returned ${response.status}`);
  return response.json();
}

async function livePayload() {
  const token = await getAccessToken();
  const user = encodeURIComponent(process.env.MS_GRAPH_USER_ID);
  const { start, end } = todayBounds();
  const calendarQuery = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    "$select": "id,subject,start,end,location,isAllDay,webLink",
    "$orderby": "start/dateTime",
    "$top": "12",
  });
  const inboxQuery = new URLSearchParams({
    "$select": "id,subject,from,receivedDateTime,isRead,importance,webLink",
    "$orderby": "receivedDateTime desc",
    "$top": "30",
  });

  const [calendarResult, inboxResult] = await Promise.all([
    graphRequest(token, `/users/${user}/calendarView?${calendarQuery}`),
    graphRequest(token, `/users/${user}/mailFolders/inbox/messages?${inboxQuery}`),
  ]);

  const calendar = (calendarResult.value || []).map((event) => ({
    id: event.id,
    title: event.subject || "Untitled event",
    start: event.start?.dateTime,
    end: event.end?.dateTime,
    location: event.location?.displayName || "",
    isAllDay: Boolean(event.isAllDay),
    url: event.webLink || "",
    isSample: false,
  }));

  const inbox = (inboxResult.value || [])
    .filter((message) => !message.isRead || message.importance === "high")
    .sort((left, right) => {
      const importanceDelta = Number(right.importance === "high") - Number(left.importance === "high");
      return importanceDelta || new Date(right.receivedDateTime) - new Date(left.receivedDateTime);
    })
    .slice(0, 6)
    .map((message) => ({
      id: message.id,
      subject: message.subject || "No subject",
      from: message.from?.emailAddress?.name || message.from?.emailAddress?.address || "Unknown sender",
      receivedAt: message.receivedDateTime,
      importance: message.importance || "normal",
      isRead: Boolean(message.isRead),
      url: message.webLink || "",
      isSample: false,
    }));

  return {
    mode: "live",
    refreshedAt: new Date().toISOString(),
    refreshIntervalMinutes: 5,
    calendar,
    inbox,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!requireAuth(req, res)) return;

  if (process.env.AIRTABLE_TOKEN) {
    try {
      const cached = await airtablePayload(process.env.AIRTABLE_TOKEN);
      if (cached) {
        res.status(200).json(cached);
        return;
      }
    } catch (error) {
      console.error("Daily dashboard Airtable refresh failed:", error.message);
    }
  }

  if (!hasGraphConfig()) {
    res.status(200).json(samplePayload("Outlook sync cache is empty"));
    return;
  }

  try {
    res.status(200).json(await livePayload());
  } catch (error) {
    console.error("Daily dashboard Microsoft Graph refresh failed:", error.message);
    res.status(200).json(samplePayload("Outlook connection needs attention"));
  }
}

