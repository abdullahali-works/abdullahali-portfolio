const DEFAULTS = window.PORTFOLIO_DEFAULTS || {};
let portfolioData = null;
const $ = (s, root=document) => root.querySelector(s);
const escapeHtml = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadPortfolioData(){
  try {
    if(location.protocol !== 'file:'){
      const r = await fetch('/api/content');
      if(r.ok){ portfolioData = await r.json(); return portfolioData; }
    }
  } catch(e){}
  try { const saved=localStorage.getItem('abdullahPortfolioContent'); if(saved) return portfolioData=JSON.parse(saved); } catch(e){}
  try { const r=await fetch('data/content.json'); if(r.ok) return portfolioData=await r.json(); } catch(e){}
  return portfolioData=JSON.parse(JSON.stringify(DEFAULTS));
}
function safeExternal(url){try{const u=new URL(url);return ['https:','http:','mailto:','tel:'].includes(u.protocol)?u.href:'#'}catch{return '#'}}
function setText(id,value){const el=document.getElementById(id);if(el)el.textContent=value||''}
function renderList(id,items,mapper){const el=document.getElementById(id);if(el)el.innerHTML=(items||[]).map(mapper).join('')}
function applyTheme(d){document.body.dataset.theme=d.theme||'midnight';document.body.dataset.mode=d.mode==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):(d.mode||'dark');if(d.custom?.accent)document.documentElement.style.setProperty('--accent',d.custom.accent);if(d.custom?.motion===false)document.documentElement.style.setProperty('scroll-behavior','auto')}
function renderPortfolio(d){
  applyTheme(d); const s=d.site||{};
  document.title=s.seoTitle||`${s.name||'Portfolio'} — Portfolio`;
  const desc=document.querySelector('meta[name="description"]');if(desc)desc.content=s.seoDescription||s.intro||'Professional portfolio';
  setText('brandName',s.name);setText('footerName',s.name);setText('heroTitle',s.tagline||s.role);setText('heroIntro',s.intro);setText('aboutText',s.about);setText('availability',s.availability);setText('locationMetric',s.location);setText('year',new Date().getFullYear());
  const navItems=[['about','About'],['skills','Skills'],['projects','Work'],['services','Services'],['contact','Let’s talk']];
  document.querySelectorAll('main section[id]').forEach(sec=>{const key=sec.id; if(d.sections && Object.prototype.hasOwnProperty.call(d.sections,key))sec.classList.toggle('hidden',!d.sections[key])});
  renderList('skillsList',d.skills,x=>`<span>${escapeHtml(x)}</span>`);
  renderList('toolsList',d.tools,x=>`<span>${escapeHtml(x)}</span>`);
  const projects=(d.projects||[]).filter(p=>p.published!==false);
  renderList('projectGrid',projects,(p,i)=>`<article class="project-card"><div class="project-art">${p.image?`<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy">`:`<span class="project-symbol">0${i+1}</span>`}</div><div class="project-body"><div class="project-meta"><span>${escapeHtml(p.category||'Project')}</span>${p.featured?'<span>Featured ✳</span>':''}</div><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.description)}</p><div class="project-tools">${escapeHtml(p.tools||'Creative process')}</div>${p.url?`<a class="project-open" target="_blank" rel="noopener" href="${escapeHtml(safeExternal(p.url))}">View project ↗</a>`:''}</div></article>`);
  renderList('serviceGrid',d.services,(x,i)=>`<article class="service-card"><span class="service-number">0${i+1} / SERVICE</span><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description)}</p></article>`);
  const timeline=(items)=>(items||[]).map(x=>`<article class="timeline-item"><h4>${escapeHtml(x.title)}</h4><div class="meta">${escapeHtml(x.place||'')} · ${escapeHtml(x.date||'')}</div><p>${escapeHtml(x.description||'')}</p></article>`).join('')||'<p class="muted">Add your real details in Admin Panel.</p>';
  const ex=$('experienceList'), ed=$('educationList');if(ex)ex.innerHTML=timeline(d.experience);if(ed)ed.innerHTML=timeline(d.education);
  const achievements=[...(d.achievements||[]),...(d.certifications||[])];
  renderList('achievementGrid',achievements,x=>`<article class="achievement-card"><span>${escapeHtml(x.date||'MILESTONE')}</span><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description||'')}</p></article>`);
  const links=[...(s.socials||[])];if(s.email)links.unshift({label:'Email me',url:`mailto:${s.email}`});if(s.whatsapp)links.push({label:'WhatsApp',url:`https://wa.me/${String(s.whatsapp).replace(/\D/g,'')}`});
  renderList('contactLinks',links,x=>`<a href="${escapeHtml(safeExternal(x.url))}" target="_blank" rel="noopener">${escapeHtml(x.label)} ↗</a>`);
  const form=$('contactForm');if(form)form.onsubmit=e=>{e.preventDefault();const name=$('#senderName').value.trim(),email=$('#senderEmail').value.trim(),message=$('#senderMessage').value.trim();if(!s.email||s.email==='hello@example.com'){ $('#formNote').textContent='Set your real contact email in Admin Panel before publishing. No message was sent.';return;}const subject=encodeURIComponent(`Portfolio enquiry from ${name}`),body=encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);$('#formNote').textContent='Opening your email app. Please review and send the message there.';location.href=`mailto:${s.email}?subject=${subject}&body=${body}`;};
}

function setupAiWidget(d){
  const widget=$('#aiWidget'), launcher=$('#aiLauncher'), panel=$('#aiPanel'), close=$('#aiClose'), form=$('#aiForm'), input=$('#aiMessageInput'), messages=$('#aiMessages');
  if(!widget||!launcher||!panel||!form||location.protocol==='file:'||!d.ai?.enabled||!d.ai?.busyMode)return;
  widget.classList.remove('hidden');
  const addMessage=(role,text)=>{const p=document.createElement('p');p.className=`ai-message ${role}`;p.textContent=text;messages.appendChild(p);messages.scrollTop=messages.scrollHeight;return p;};
  const open=()=>{panel.classList.remove('hidden');launcher.setAttribute('aria-expanded','true');input.focus();};
  const shut=()=>{panel.classList.add('hidden');launcher.setAttribute('aria-expanded','false');launcher.focus();};
  launcher.addEventListener('click',()=>panel.classList.contains('hidden')?open():shut());
  close?.addEventListener('click',shut);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const message=input.value.trim();if(!message)return;
    addMessage('user',message);input.value='';input.disabled=true;form.querySelector('button').disabled=true;
    const pending=addMessage('assistant','Thinking…');
    try{
      const response=await fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'The assistant is temporarily unavailable.');
      pending.textContent=result.answer||'I could not prepare an answer. Please contact the owner directly.';
    }catch(err){pending.textContent=err.message||'The assistant is temporarily unavailable. Please try again later.';}
    finally{input.disabled=false;form.querySelector('button').disabled=false;input.focus();messages.scrollTop=messages.scrollHeight;}
  });
}

(async()=>{const d=await loadPortfolioData();renderPortfolio(d);setupAiWidget(d);const toggle=$('#menuToggle'),nav=$('#mainNav');toggle?.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open))});nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');toggle?.setAttribute('aria-expanded','false')}));})();
