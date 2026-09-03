import { requireAuth } from "./_auth.js";

const TOPICS = [
  ["Switzerland", "Switzerland when:1d"],
  ["World", "world news when:1d"],
  ["AI & tech", "artificial intelligence technology when:2d"],
  ["Markets", "stock markets investing when:1d"],
  ["Football", "football Europe when:1d"],
];

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(match?.[1] || "").trim();
}

async function latestFor(category, query) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "CH");
  url.searchParams.set("ceid", "CH:en");
  const response = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml;q=0.9" } });
  if (!response.ok) throw new Error(`${category} briefing returned ${response.status}`);
  const xml = await response.text();
  const item = xml.match(/<item>([\s\S]*?)<\/item>/i)?.[1];
  if (!item) throw new Error(`${category} briefing was empty`);
  return {
    category,
    title: tag(item, "title").replace(/\s+-\s+[^-]+$/, ""),
    url: tag(item, "link"),
    source: tag(item, "source") || "News",
    publishedAt: tag(item, "pubDate"),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, max-age=0, s-maxage=1800, stale-while-revalidate=3600");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!requireAuth(req, res)) return;

  const results = await Promise.allSettled(TOPICS.map(([category, query]) => latestFor(category, query)));
  const items = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!items.length) {
    res.status(502).json({ error: "The morning briefing is temporarily unavailable." });
    return;
  }
  res.status(200).json({ refreshedAt: new Date().toISOString(), items });
}

