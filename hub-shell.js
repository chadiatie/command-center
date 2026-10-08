(() => {
  const page=document.body.dataset.page;
  const header=document.getElementById('hubHeader');
  if(header) header.innerHTML=`<a class="hub-brand" href="/" aria-label="Aurora Today">Aurora</a><nav class="hub-nav" aria-label="Aurora sections"><a href="/" ${page==='today'?'aria-current="page"':''}>Today</a><a href="/apps.html" ${page==='apps'?'aria-current="page"':''}>Apps</a><a href="/subscriptions.html">Subscriptions</a></nav><div class="hub-appearance" role="group" aria-label="Appearance"><button type="button" data-theme-choice="light" aria-label="Light mode" aria-pressed="false"><span class="material-symbols-rounded" aria-hidden="true">light_mode</span></button><button type="button" data-theme-choice="dark" aria-label="Dark mode" aria-pressed="true"><span class="material-symbols-rounded" aria-hidden="true">dark_mode</span></button></div>`;
})();
