const FEEDS = [
  {name:'The Rundown AI',topic:'AI',home:'https://www.therundown.ai',url:'https://www.therundown.ai/feed'},
  {name:'OpenAI',topic:'AI',home:'https://openai.com/news',url:'https://openai.com/news/rss.xml'},
  {name:'Google AI',topic:'AI',home:'https://blog.google/innovation-and-ai/technology/ai/',url:'https://blog.google/technology/ai/rss/'},
  {name:'TechCrunch',topic:'AI',home:'https://techcrunch.com',url:'https://techcrunch.com/category/artificial-intelligence/feed/'},
  {name:'BBC News',topic:'World',home:'https://www.bbc.com/news',url:'https://feeds.bbci.co.uk/news/world/rss.xml'},
  {name:'Swiss news',topic:'Switzerland',home:'https://news.google.com',url:'https://news.google.com/rss/search?q=(site:swissinfo.ch%20OR%20site:rts.ch%20OR%20site:letemps.ch)%20Switzerland%20when:2d&hl=en&gl=CH&ceid=CH:en'}
];
let cache;
const MAX_AGE=15*60*1000;
export function decodeXml(value='') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#x([a-f0-9]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>{const c=Number(n);return c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
}
const strip=s=>decodeXml(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').replace(/\s+([.,!?;:])/g,'$1').trim();
const tag=(s,name)=>decodeXml(s.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'').trim();
const attr=(s,name)=>decodeXml(s.match(new RegExp('\\b'+name+'\\s*=\\s*["\']([^"\']+)["\']','i'))?.[1]||'');
function https(value,base){if(!value)return '';try{const u=new URL(value,base);return u.protocol==='https:'?u.href:'';}catch{return '';}}
export function parseFeed(xml,feed,now=Date.now()) {
  if(!/<(?:rss|feed)\b/i.test(xml))throw new Error('Invalid feed');
  const blocks=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  return blocks.slice(0,25).flatMap(block=>{
    const raw=tag(block,'title');const source=tag(block,'source')||feed.name;
    const title=strip(raw).replace(new RegExp('\\s+-\\s+'+source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'),'');
    const url=https(tag(block,'link'),feed.home);const published=Date.parse(tag(block,'pubDate')||tag(block,'dc:date'));
    if(!title||!url||!Number.isFinite(published)||published>now+3600000||now-published>14*86400000)return [];
    const description=tag(block,'description');
    const media=block.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/i)?.[0]||'';
    const embedded=decodeXml(description+' '+tag(block,'content:encoded')).match(/<img\b[^>]*>/i)?.[0]||'';
    let image=https(attr(media,'url')||attr(embedded,'src'),feed.home);
    if(image&&/\.svg(?:\?|$)/i.test(image))image='';
    const sourceTag=block.match(/<source\b[^>]*>/i)?.[0]||'';
    return [{id:url,title,url,source,sourceUrl:https(attr(sourceTag,'url'),feed.home)||feed.home,topic:feed.topic,publishedAt:new Date(published).toISOString(),summary:strip(description).slice(0,180),image}];
  });
}
async function fetchFeed(feed){
  const r=await fetch(feed.url,{headers:{Accept:'application/rss+xml, application/xml;q=0.9','User-Agent':'Aurora personal news reader'},signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw new Error('Feed unavailable');const xml=await r.text();if(xml.length>4000000)throw new Error('Feed too large');return parseFeed(xml,feed);
}
async function fillImage(item){
  if(item.image||!['The Rundown AI','TechCrunch','OpenAI','Google AI'].includes(item.source))return;
  const host=new URL(item.url).hostname;
  if(!['www.therundown.ai','therundown.ai','techcrunch.com','openai.com','blog.google'].includes(host))return;
  try{const r=await fetch(item.url,{signal:AbortSignal.timeout(4500),redirect:'manual',headers:{'User-Agent':'Aurora personal news reader'}});if(!r.ok)return;const html=(await r.text()).slice(0,1000000);const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]).find(x=>attr(x,'property')==='og:image'||attr(x,'name')==='og:image');if(meta)item.image=https(attr(meta,'content'),item.url);}catch{}
}
function unique(items){
  const seen=new Set();return items.filter(x=>{const key=x.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();if(seen.has(key))return false;seen.add(key);return true;});
}
export async function loadNews(){
  if(cache&&Date.now()-cache.at<MAX_AGE)return cache.payload;
  const results=await Promise.allSettled(FEEDS.map(fetchFeed));
  const items=unique(results.flatMap(r=>r.status==='fulfilled'?r.value:[])).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  if(!items.length){if(cache)return {...cache.payload,stale:true};throw new Error('News feeds are temporarily unavailable.');}
  const byTopic={AI:FEEDS.filter(f=>f.topic==='AI').flatMap(f=>items.filter(x=>x.source===f.name).slice(0,6)).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)),World:items.filter(x=>x.topic==='World').slice(0,12),Switzerland:items.filter(x=>x.topic==='Switzerland').slice(0,12)};
  const balanced=unique([...(byTopic.AI||[]),...(byTopic.World||[]),...(byTopic.Switzerland||[])]);
  await Promise.all(FEEDS.filter(f=>f.topic==='AI').flatMap(f=>balanced.filter(x=>x.source===f.name&&!x.image).slice(0,2)).map(fillImage));
  const payload={refreshedAt:new Date().toISOString(),items:balanced,partial:results.some(r=>r.status==='rejected'),feeds:FEEDS.map((f,i)=>({name:f.name,topic:f.topic,available:results[i].status==='fulfilled'}))};
  cache={at:Date.now(),payload};return payload;
}
export async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
  try{return res.status(200).json(await loadNews());}catch{return res.status(502).json({error:'News is temporarily unavailable. Please try again shortly.'});}
}
export default handler;
