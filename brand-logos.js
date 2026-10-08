(() => {
  let logos={};
  const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}};
  async function load(){try{const r=await fetch('/logo-map.json');if(r.ok)logos=await r.json();}catch{}}
  function icon(item,className='app-icon'){
    const well=document.createElement('span');well.className=className;
    const domain=host(item.url||item.sourceUrl||'');
    const special=logos['name:'+item.name];
    const local=special||logos[domain]||logos['www.'+domain];
    const disabled=Object.hasOwn(logos,domain)&&logos[domain]===null;
    const urls=disabled?[]:[local,item.logo,domain?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(domain)+'&sz=128':''].filter(Boolean);
    const fallback=()=>{well.replaceChildren();const text=document.createElement('span');text.className='initials';text.textContent=(item.name||item.source||domain||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();well.append(text);well.title='No verified logo available';};
    if(!urls.length){fallback();return well;}
    const image=document.createElement('img');image.alt='';image.loading='lazy';image.decoding='async';let index=0;
    image.onload=()=>{if(image.naturalWidth&&image.naturalWidth<40)image.style.width=image.naturalWidth+'px';};
    image.onerror=()=>{if(++index<urls.length)image.src=urls[index];else fallback();};
    image.src=urls[0];well.append(image);return well;
  }
  window.AuroraLogos={load,icon,host};
})();
