(() => {
  const $=id=>document.getElementById(id);
  const clean=s=>(s||'').replace(/^[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D\s]+/u,'').trim();
  const slug=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const key=item=>[item.mode,item.name,item.url].join('|');
  const storageKey='aurora.topApps.v1';
  let data=[],favorites=[],mode='Tools',section='',category='',editing=false;
  const q=()=> $('appSearch').value.trim().toLowerCase();
  const starterNames=['ChatGPT','Claude','Gemini','Perplexity','NotebookLM','Notion','Canva','GitHub'];
  const collection=()=>data.filter(x=>x.mode===mode);
  const sections=()=>[...new Set(collection().map(x=>x.section))].sort((a,b)=>Math.min(...collection().filter(x=>x.section===a).map(x=>x.sort))-Math.min(...collection().filter(x=>x.section===b).map(x=>x.sort)));
  function starter(){return starterNames.map(name=>data.find(x=>x.name===name)).filter(Boolean).map(key);}
  function storeFavorites(){try{localStorage.setItem(storageKey,JSON.stringify(favorites));}catch{}renderFavorites();renderResults();}
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=> $('toast').hidden=true,2200);}
  function toggle(item){const id=key(item);if(favorites.includes(id))favorites=favorites.filter(x=>x!==id);else if(favorites.length<12)favorites.push(id);else{toast('You can pin up to 12 apps.');return;}storeFavorites();}
  function symbol(name){const s=document.createElement('span');s.className='material-symbols-rounded';s.setAttribute('aria-hidden','true');s.textContent=name;return s;}
  function button(label,selected,onClick,className='category-button'){const b=document.createElement('button');b.type='button';b.className=className;b.textContent=label;b.setAttribute('aria-pressed',String(selected));if(selected)b.classList.add('selected');b.addEventListener('click',onClick);return b;}
  function pinned(){return favorites.map(id=>data.find(x=>key(x)===id)).filter(Boolean);}
  function renderFavorites(){
    const root=$('favorites');root.replaceChildren();
    pinned().forEach(item=>{const a=document.createElement('a');a.className='favorite';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.append(AuroraLogos.icon(item));const name=document.createElement('span');name.textContent=item.name;a.append(name);root.append(a);});
    if(!root.children.length)root.innerHTML='<p class="empty-state">Star a tool or source below to add your first favorite.</p>';
    if(editing)renderEditor();
  }
  function renderEditor(){
    $('favoriteEditor').replaceChildren();pinned().forEach((item,index)=>{const row=document.createElement('div');row.className='favorite-edit-row';const name=document.createElement('span');name.textContent=item.name;row.append(AuroraLogos.icon(item),name);
      const up=document.createElement('button');up.type='button';up.className='star-button';up.setAttribute('aria-label','Move '+item.name+' earlier');up.append(symbol('arrow_upward'));up.disabled=index===0;up.onclick=()=>{[favorites[index-1],favorites[index]]=[favorites[index],favorites[index-1]];storeFavorites();};
      const remove=document.createElement('button');remove.type='button';remove.className='star-button';remove.setAttribute('aria-label','Unpin '+item.name);remove.append(symbol('close'));remove.onclick=()=>toggle(item);row.append(up,remove);$('favoriteEditor').append(row);});$('favoriteHint').textContent=favorites.length+' of 12 pins';
  }
  function urlState(push=false){const u=new URL(location.href);u.pathname='/apps.html';u.search='';if(mode==='Sources')u.searchParams.set('mode','Sources');u.searchParams.set('section',section?slug(section):'all');if(category)u.searchParams.set('category',slug(category));(push?history.pushState:history.replaceState).call(history,null,'',u.pathname+u.search);}
  function readState(){const u=new URL(location.href);mode=u.searchParams.get('mode')==='Sources'?'Sources':'Tools';const available=sections();section=available.find(x=>slug(x)===u.searchParams.get('section'))||((u.searchParams.get('section')==='all')?'':available[0])||'';category=collection().find(x=>x.section===section&&slug(x.category)===u.searchParams.get('category'))?.category||'';}
  function selectSection(value){section=value;category='';renderAll();urlState(true);}
  function selectCategory(value){category=value;renderCategories();renderResults();urlState(true);}
  function renderNavigation(){
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    const root=$('categoryNav');root.replaceChildren();const select=$('mobileCategory');select.replaceChildren();
    const all=button(mode==='Sources'?'All sources':'All tools',!section,()=>selectSection(''));all.prepend(symbol('grid_view'));const total=document.createElement('span');total.className='count';total.textContent=collection().length;all.append(total);root.append(all);
    const allOption=new Option(mode==='Sources'?'All sources':'All tools','');select.append(allOption);
    const iconFor=s=>{const t=clean(s).toLowerCase();return /news/.test(t)?'newspaper':/media/.test(t)?'image':/data/.test(t)?'bar_chart':/research|strategy/.test(t)?'menu_book':/build|software/.test(t)?'code':/remote/.test(t)?'devices':/form/.test(t)?'assignment':/commerce/.test(t)?'shopping_bag':/automate/.test(t)?'sync':/community|communities/.test(t)?'forum':/design/.test(t)?'palette':/tech/.test(t)?'memory':/assist/.test(t)?'auto_awesome':'category';};
    sections().forEach(s=>{const b=button(clean(s),s===section,()=>selectSection(s));b.prepend(symbol(iconFor(s)));const n=document.createElement('span');n.className='count';n.textContent=collection().filter(x=>x.section===s).length;b.append(n);root.append(b);select.append(new Option(clean(s),s));});select.value=section;renderCategories();
  }
  function categories(){return [...new Set(collection().filter(x=>!section||x.section===section).map(x=>x.category))].sort((a,b)=>Math.min(...collection().filter(x=>x.category===a).map(x=>x.sort))-Math.min(...collection().filter(x=>x.category===b).map(x=>x.sort)));}
  function renderCategories(){const root=$('subcategories'),sub=$('sidebarSub');root.replaceChildren();sub.replaceChildren();const label=document.createElement('span');label.className='sidebar-label';label.textContent=section?clean(section):'Subcategories';sub.append(label);
    const choices=['',...categories()];for(const c of choices){root.append(button(c?clean(c):'All',category===c,()=>selectCategory(c),'chip'));if(section)sub.append(button(c?clean(c):'All',category===c,()=>selectCategory(c),'category-button subcategory-button'));}sub.hidden=!section;}
  function tile(item){
    const card=document.createElement('article');card.className='app-tile';const a=document.createElement('a');a.className='app-link';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';const copy=document.createElement('span');copy.className='app-copy';const name=document.createElement('span');name.className='app-name';name.textContent=item.name;const domain=document.createElement('span');domain.className='app-domain';domain.textContent=AuroraLogos.host(item.url);copy.append(name,domain);a.append(AuroraLogos.icon(item),copy);
    const star=document.createElement('button');star.type='button';star.className='star-button';star.setAttribute('aria-label','Pin '+item.name);star.setAttribute('aria-pressed',String(favorites.includes(key(item))));star.append(symbol('star'));star.onclick=()=>toggle(item);card.append(a,star);return card;
  }
  function renderResults(){
    const items=collection().filter(x=>(!section||x.section===section)&&(!category||x.category===category)&&(!q()||[x.name,x.domain,x.category,x.section].join(' ').toLowerCase().includes(q()))).sort((a,b)=>a.sort-b.sort);
    $('collectionTitle').textContent=section?clean(section):mode==='Sources'?'All sources':'All tools';$('resultCount').textContent=items.length+' '+(mode==='Sources'?(items.length===1?'source':'sources'):(items.length===1?'tool':'tools'))+ (q()?' matching your search':'');
    const root=$('catalogResults');root.replaceChildren();if(!items.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<p>No apps match these filters.</p>';const clear=document.createElement('button');clear.type='button';clear.className='quiet-button';clear.textContent='Clear filters';clear.onclick=()=>{$('appSearch').value='';section='';category='';renderAll();urlState();};empty.append(clear);root.append(empty);return;}
    const groups=new Map();items.forEach(x=>{const id=x.section+'|'+x.category;if(!groups.has(id))groups.set(id,{section:x.section,category:x.category,items:[]});groups.get(id).items.push(x);});
    for(const group of groups.values()){const header=document.createElement('div');header.className='group-heading';const title=document.createElement('h3');title.textContent=clean(group.category);header.append(title);if(!section){const small=document.createElement('small');small.textContent=clean(group.section);header.append(small);}const grid=document.createElement('div');grid.className='app-grid';group.items.forEach(item=>grid.append(tile(item)));root.append(header,grid);}
  }
  function renderAll(){renderNavigation();renderResults();}
  async function init(){try{await AuroraLogos.load();const r=await fetch('/api/data');if(!r.ok)throw Error();const payload=await r.json();data=(payload.items||[]).filter(x=>x.name&&x.url&&['Tools','Sources'].includes(x.mode));if(!data.length)throw Error();try{const stored=JSON.parse(localStorage.getItem(storageKey));favorites=Array.isArray(stored)?stored.filter(id=>data.some(x=>key(x)===id)).slice(0,12):starter();}catch{favorites=starter();}readState();renderFavorites();renderAll();}catch{$('catalogResults').innerHTML='<div class="empty-state"><p>The catalog could not load.</p><p>Refresh to try again.</p></div>';$('favorites').innerHTML='';}}
  $('appSearch').addEventListener('input',renderResults);$('mobileCategory').onchange=e=>selectSection(e.target.value);
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;section=sections()[0]||'';category='';$('appSearch').value='';renderAll();urlState(true);});
  $('editFavorites').onclick=()=>{editing=true;renderEditor();$('favoriteDialog').showModal();};$('closeFavorites').onclick=()=> $('favoriteDialog').close();$('favoriteDialog').addEventListener('close',()=>editing=false);$('resetFavorites').onclick=()=>{favorites=starter();storeFavorites();};
  window.addEventListener('popstate',()=>{readState();renderAll();});init();
})();
