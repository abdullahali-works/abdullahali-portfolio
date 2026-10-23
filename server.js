// Minimal same-origin backend for shared portfolio content and secure admin login.
// Requires Node.js 18+. Configure ADMIN_USERNAME and ADMIN_PASSWORD before first start.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const ROOT = __dirname;
const PRIVATE = path.join(ROOT, '.private');
const AUTH_FILE = path.join(PRIVATE, 'admin-auth.json');
const CONTENT_FILE = path.join(ROOT, 'content.json');
const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();
const attempts = new Map();
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};

function send(res,status,obj,headers={}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(JSON.stringify(obj));
}
function cookie(req,name) {
  const raw=req.headers.cookie||'';
  for(const part of raw.split(';')) { const i=part.indexOf('='); if(i>0 && part.slice(0,i).trim()===name) return decodeURIComponent(part.slice(i+1).trim()); }
  return '';
}
function session(req) { const id=cookie(req,'portfolio_session'); const s=sessions.get(id); return s && s.expires>Date.now() ? {id,...s} : null; }
function secureCookie(req) { return (req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https'; }
function setSession(res,req,id) {
  const flags=`Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secureCookie(req)?'; Secure':''}`;
  res.setHeader('Set-Cookie',`portfolio_session=${encodeURIComponent(id)}; ${flags}`);
}
async function readBody(req) {
  let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>2_000_000) throw new Error('Request too large.'); }
  try{return JSON.parse(raw||'{}')}catch{throw new Error('Invalid JSON.')}
}
async function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')) {
  const key=await scrypt(password,salt,64);
  return {salt,hash:key.toString('hex')};
}
async function verifyPassword(password,record) {
  const key=await scrypt(password,record.salt,64);
  const a=Buffer.from(key.toString('hex'),'hex'), b=Buffer.from(record.hash,'hex');
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
async function initialize() {
  fs.mkdirSync(PRIVATE,{recursive:true});
  if(!fs.existsSync(CONTENT_FILE)) throw new Error('content.json is missing.');
  if(!fs.existsSync(AUTH_FILE)) {
    const username=process.env.ADMIN_USERNAME, password=process.env.ADMIN_PASSWORD;
    if(!username || !password || password.length<12) {
      throw new Error('First setup required: set ADMIN_USERNAME and ADMIN_PASSWORD (12+ characters) before starting. See README.md.');
    }
    const record={username,...await hashPassword(password),createdAt:new Date().toISOString()};
    fs.writeFileSync(AUTH_FILE,JSON.stringify(record,null,2),{mode:0o600});
    console.log('Created first admin account from environment variables.');
  }
}
function authorized(req) { return !!session(req); }

const server=http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) {
      if(req.method==='GET' && url.pathname==='/api/content') {
        const data=JSON.parse(fs.readFileSync(CONTENT_FILE,'utf8'));
        return send(res,200,data);
      }
      if(req.method==='GET' && url.pathname==='/api/session') {
        if(!authorized(req)) return send(res,401,{error:'Please sign in.'});
        return send(res,200,{authenticated:true});
      }
      if(req.method==='POST' && url.pathname==='/api/login') {
        const ip=req.socket.remoteAddress||'unknown', now=Date.now(), prev=attempts.get(ip)||{count:0,until:0};
        if(prev.until>now && prev.count>=8) return send(res,429,{error:'Too many login attempts. Wait 15 minutes.'});
        const body=await readBody(req), auth=JSON.parse(fs.readFileSync(AUTH_FILE,'utf8'));
        const good=typeof body.username==='string' && typeof body.password==='string' && body.username===auth.username && await verifyPassword(body.password,auth);
        if(!good) { prev.count++; if(prev.count>=8) prev.until=now+15*60*1000; attempts.set(ip,prev); return send(res,401,{error:'Incorrect username or password.'}); }
        attempts.delete(ip);
        const id=crypto.randomBytes(32).toString('hex');
        sessions.set(id,{expires:now+12*60*60*1000});
        setSession(res,req,id);
        return send(res,200,{ok:true});
      }
      if(req.method==='POST' && url.pathname==='/api/logout') {
        const id=cookie(req,'portfolio_session'); sessions.delete(id);
        res.setHeader('Set-Cookie',`portfolio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie(req)?'; Secure':''}`);
        return send(res,200,{ok:true});
      }
      if(req.method==='PUT' && url.pathname==='/api/content') {
        if(!authorized(req)) return send(res,401,{error:'Please sign in again.'});
        const body=await readBody(req);
        if(!body || typeof body!=='object' || Array.isArray(body) || !body.site) return send(res,400,{error:'Invalid portfolio content.'});
        const tmp=CONTENT_FILE+'.tmp';
        fs.writeFileSync(tmp,JSON.stringify(body,null,2)+'\n',{mode:0o600});
        fs.renameSync(tmp,CONTENT_FILE);
        return send(res,200,{ok:true});
      }
      if(req.method==='POST' && url.pathname==='/api/account') {
        if(!authorized(req)) return send(res,401,{error:'Please sign in again.'});
        const body=await readBody(req), auth=JSON.parse(fs.readFileSync(AUTH_FILE,'utf8'));
        if(typeof body.currentPassword!=='string' || !await verifyPassword(body.currentPassword,auth)) return send(res,401,{error:'Current password is incorrect.'});
        if(typeof body.username!=='string' || !body.username.trim() || typeof body.password!=='string' || body.password.length<12) return send(res,400,{error:'Username is required and password must have at least 12 characters.'});
        const next={username:body.username.trim(),...await hashPassword(body.password),createdAt:auth.createdAt,updatedAt:new Date().toISOString()};
        const tmp=AUTH_FILE+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600}); fs.renameSync(tmp,AUTH_FILE);
        sessions.clear(); // Revoke every existing admin session after credential changes.
        res.setHeader('Set-Cookie',`portfolio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie(req)?'; Secure':''}`);
        return send(res,200,{ok:true});
      }
      return send(res,404,{error:'API endpoint not found.'});
    }
    let pathname=decodeURIComponent(url.pathname);
    if(pathname==='/') pathname='/index.html';
    const file=path.resolve(ROOT,'.'+pathname);
    if(!file.startsWith(ROOT+path.sep) || pathname.split('/').some(part=>part.startsWith('.'))) return send(res,404,{error:'Not found.'});
    if(!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res,404,{error:'Not found.'});
    const ext=path.extname(file).toLowerCase();
    res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':ext==='.html'?'no-cache':'public, max-age=3600'});
    fs.createReadStream(file).pipe(res);
  } catch(err) {
    console.error(err);
    if(!res.headersSent) send(res,500,{error:err.message||'Server error.'});
    else res.destroy();
  }
});
initialize().then(()=>server.listen(PORT,()=>console.log(`Portfolio running at http://localhost:${PORT}`))).catch(err=>{console.error(err.message);process.exit(1)});
