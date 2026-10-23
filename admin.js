let data=null, hosted=false, authenticated=false, editingProjectIndex=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function request(path,opts={}){
  const r=await fetch(path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})},credentials:'same-origin'});
  let j={};
  try{j=await r.json()}catch{}
  if(!r.ok)throw new Error(j.error||`Request failed (${r.status})`);
  return j;
}

function lines(v){return (v||'').split('\n').map(x=>x.trim()).filter(Boolean)}
function parseItems(v){return lines(v).map(line=>{const [title,place='',date='',description='']=line.split('|').map(x=>x.trim());return {title,place,date,description}})}
function formatItems(items){return (items||[]).map(x=>[x.title,x.place,x.date,x.description].join(' | ')).join('\n')}
function set(id,v){const e=$('#'+id);if(e)e.value=v??''}
function get(id){return $('#'+id)?.value?.trim()||''}
function notice(text){$('#saveStatus').textContent=text}

// Dynamic Theme & Background Applicator
function applyThemeSettings(theme, mode, accentColor) {
  const body = document.body;
  body.setAttribute('data-theme', theme || 'midnight');
  body.setAttribute('data-mode', mode || 'dark');
  if (accentColor) {
    document.documentElement.style.setProperty('--accent', accentColor);
  }
}

async function start(){
  // This version requires the same-origin server backend. No browser-only fallback.
  try {
    await request('/api/session');
    hosted = true;
    authenticated = true;
    data = await request('/api/content');
    showApp(true);
    fillForm();
  } catch (err) {
    $('#loginBox').classList.remove('hidden');
    $('#localWarning').classList.remove('hidden');
    $('#localWarning').textContent='Secure server mode is required. Start the portfolio server and open this page through its http:// address. GitHub Pages alone cannot save shared changes or securely protect admin login.';
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#loginMessage').textContent='Signing in…';
      try {
        await request('/api/login',{method:'POST',body:JSON.stringify({username:get('username'),password:$('#password').value})});
        data = await request('/api/content');
        authenticated = true; hosted = true;
        $('#loginMessage').textContent='';
        showApp(true); fillForm();
      } catch (error) {
        $('#loginMessage').textContent=error.message || 'Login failed.';
      }
    });
  }
}

function showApp(isHosted){
  $('#loginBox').classList.add('hidden');
  $('#adminApp').classList.remove('hidden');
  $('#connectionTitle').textContent='Shared server content';
  $('#connectionText').textContent='Changes are saved on the server and shared across browsers and devices.';
  $('#authBadge').textContent='SERVER MODE';
  $('#logoutBtn').style.display='inline-block';
}

function fillForm(){
  const s=data.site||{};
  [['name',s.name],['role',s.role],['tagline',s.tagline],['location',s.location],['email',s.email],['whatsapp',s.whatsapp],['availability',s.availability],['resume',s.resumeUrl],['intro',s.intro],['about',s.about],['seoTitle',s.seoTitle],['seoDescription',s.seoDescription]].forEach(([k,v])=>set('f-'+k,v));
  set('f-socials',(s.socials||[]).map(x=>`${x.label} | ${x.url}`).join('\n'));
  set('f-skills',(data.skills||[]).join('\n'));
  set('f-tools',(data.tools||[]).join('\n'));
  set('f-experience',formatItems(data.experience));
  set('f-education',formatItems(data.education));
  set('f-theme',data.theme||'midnight');
  set('f-mode',data.mode||'dark');
  set('f-accent',data.custom?.accent||'#9b8cff');

  const sec=data.sections||{};
  $('#sectionToggles').innerHTML=Object.keys({home:1,about:1,skills:1,projects:1,services:1,experience:1,achievements:1,contact:1}).map(k=>`<label class="admin-field"><span><input type="checkbox" data-section="${k}" ${sec[k]!==false?'checked':''} style="width:auto"> ${k[0].toUpperCase()+k.slice(1)}</span></label>`).join('');
  
  renderProjects();
  renderServices();

  // Apply theme & background styles immediately
  applyThemeSettings(data.theme, data.mode, data.custom?.accent);
}

function collectForm(){
  const s=data.site||(data.site={});
  [['name','name'],['role','role'],['tagline','tagline'],['location','location'],['email','email'],['whatsapp','whatsapp'],['availability','availability'],['resume','resumeUrl'],['intro','intro'],['about','about'],['seoTitle','seoTitle'],['seoDescription','seoDescription']].forEach(([id,key])=>s[key]=get('f-'+id));
  s.socials=lines(get('f-socials')).map(line=>{const i=line.indexOf('|');return i<0?{label:line,url:'#'}:{label:line.slice(0,i).trim(),url:line.slice(i+1).trim()}});
  data.skills=lines(get('f-skills'));data.tools=lines(get('f-tools'));data.experience=parseItems(get('f-experience'));data.education=parseItems(get('f-education'));data.theme=get('f-theme');data.mode=get('f-mode');data.custom=data.custom||{};data.custom.accent=get('f-accent');
  data.sections=data.sections||{};document.querySelectorAll('[data-section]').forEach(e=>data.sections[e.dataset.section]=e.checked);
}

function renderProjects(){const el=$('#projectsList');el.innerHTML=(data.projects||[]).map((p,i)=>`<div class="item-row"><div><strong>${esc(p.title)}</strong><small>${esc(p.category||'Project')} · ${p.published===false?'Draft':'Published'}</small></div><div><button class="admin-action" data-edit-project="${i}">Edit</button> <button class="admin-action" data-delete-project="${i}">Delete</button></div></div>`).join('')||'<p class="muted">No projects yet.</p>'}
function renderServices(){const el=$('#servicesList');el.innerHTML=(data.services||[]).map((s,i)=>`<div class="item-row"><div><strong>${esc(s.title)}</strong><small>${esc(s.description)}</small></div><button class="admin-action" data-delete-service="${i}">Delete</button></div>`).join('')||'<p class="muted">No services yet.</p>'}

async function save(){
  collectForm();
  try{
    await request('/api/content',{method:'PUT',body:JSON.stringify(data)});
    notice('Saved to the server. Changes are shared across browsers and devices.');
  }catch(e){notice('Save failed: '+e.message)}
}

document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('hidden',p.id!=='tab-'+b.dataset.tab))}));
$('#saveAll').addEventListener('click',save);

$('#addProject').addEventListener('click',()=>{
  const title=get('p-title');if(!title){notice('Enter a project title first.');return}
  data.projects=data.projects||[];
  const project={id:editingProjectIndex===null?'p-'+Date.now():(data.projects[editingProjectIndex]?.id||'p-'+Date.now()),title,category:get('p-category')||'Project',tools:get('p-tools'),url:get('p-url'),image:get('p-image'),description:get('p-description'),featured:get('p-featured')==='true',published:editingProjectIndex===null?true:(data.projects[editingProjectIndex]?.published!==false)};
  if(editingProjectIndex===null)data.projects.unshift(project);else data.projects[editingProjectIndex]=project;
  editingProjectIndex=null;$('#addProject').textContent='Add project';
  ['p-title','p-category','p-tools','p-url','p-image','p-description'].forEach(id=>set(id,''));renderProjects();notice('Project updated.')
});

$('#addService').addEventListener('click',()=>{const title=get('sv-title');if(!title)return notice('Enter a service title first.');data.services=data.services||[];data.services.push({title,description:get('sv-description')});set('sv-title','');set('sv-description','');renderServices();notice('Service added.')});

document.addEventListener('click', e => {
  const delp = e.target.closest('[data-delete-project]');
  if (delp) {
    const i = Number(delp.dataset.deleteProject);
    if (confirm('Delete this project?')) {
      data.projects.splice(i, 1); renderProjects(); notice('Project deleted.');
    }
  }
  const dels = e.target.closest('[data-delete-service]');
  if (dels) {
    const i = Number(dels.dataset.deleteService);
    if (confirm('Delete this service?')) {
      data.services.splice(i, 1); renderServices(); notice('Service deleted.');
    }
  }
  const edit = e.target.closest('[data-edit-project]');
  if (edit) {
    const i = Number(edit.dataset.editProject), project = data.projects[i];
    editingProjectIndex=i;
    set('p-title', project.title); set('p-category', project.category);
    set('p-tools', project.tools); set('p-url', project.url);
    set('p-image', project.image); set('p-description', project.description);
    set('p-featured', String(!!project.featured));
    $('#addProject').textContent='Update project';
    document.querySelector('[data-tab="projects"]').click();
  }
});

$('#exportData').addEventListener('click',()=>{collectForm();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='portfolio-backup.json';a.click();URL.revokeObjectURL(a.href)});
$('#importFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(confirm('Restore this backup?')){data=d;fillForm();notice('Backup loaded.')}}catch(err){notice('Could not restore: '+err.message)}e.target.value=''});
$('#logoutBtn').addEventListener('click',async()=>{try{await request('/api/logout',{method:'POST',body:'{}'})}catch{} location.reload()});


$('#accountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const message=$('#accountMessage');
  const current=$('#currentAccountPassword').value;
  const username=$('#newAccountUsername').value.trim();
  const password=$('#newAccountPassword').value;
  const confirmPassword=$('#confirmAccountPassword').value;
  if (!username) { message.textContent='Enter a username.'; return; }
  if (password.length<12) { message.textContent='Use a password with at least 12 characters.'; return; }
  if (password!==confirmPassword) { message.textContent='The new passwords do not match.'; return; }
  try {
    await request('/api/account',{method:'POST',body:JSON.stringify({currentPassword:current,username,password})});
    ['currentAccountPassword','newAccountPassword','confirmAccountPassword'].forEach(id=>set(id,''));
    message.textContent='Login details updated securely. Please sign in again with the new credentials.';
    setTimeout(()=>location.reload(),1200);
  } catch(err) { message.textContent=err.message; }
});

start();

// Live theme preview listeners
$('#f-theme')?.addEventListener('change', (e) => applyThemeSettings(e.target.value, get('f-mode'), get('f-accent')));
$('#f-mode')?.addEventListener('change', (e) => applyThemeSettings(get('f-theme'), e.target.value, get('f-accent')));
$('#f-accent')?.addEventListener('input', (e) => applyThemeSettings(get('f-theme'), get('f-mode'), e.target.value));
