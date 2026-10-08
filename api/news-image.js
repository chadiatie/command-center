const HOSTS=new Set(['techcrunch.com','storage.googleapis.com','ichef.bbci.co.uk','images.ctfassets.net','www.therundown.ai','therundown.ai','beehiiv-images-production.s3.amazonaws.com','media.beehiiv.com']);
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');res.statusCode=405;return res.end();}
  let url;try{url=new URL(new URL(req.url,'https://aurora.local').searchParams.get('url'));}catch{res.statusCode=400;return res.end();}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!HOSTS.has(url.hostname)){res.statusCode=400;return res.end();}
  try{
    const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(6000),headers:{'User-Agent':'Mozilla/5.0','Accept':'image/avif,image/webp,image/*'}});
    const type=r.headers.get('content-type')||'';
    if(!r.ok||!/^image\/(?:png|jpe?g|webp|avif|gif)(?:;|$)/i.test(type)||Number(r.headers.get('content-length'))>4000000)throw Error();
    const b=Buffer.from(await r.arrayBuffer());if(b.length>4000000)throw Error();
    res.setHeader('Content-Type',type);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','public, max-age=86400, s-maxage=86400');return res.end(b);
  }catch{res.statusCode=404;return res.end();}
}
