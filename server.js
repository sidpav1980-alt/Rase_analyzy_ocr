const http=require('http'),fs=require('fs'),path=require('path'),url=require('url');
const ROOT=__dirname, PORT=process.env.PORT||3000;

function send(res,status,obj,headers={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});
  res.end(JSON.stringify(obj));
}
async function api(req,res,p){
  if(p==='/api/health') return send(res,200,{ok:true,version:'1.001-offline'});
  return false;
}
const mime={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.json':'application/json'
};
const server=http.createServer(async(req,res)=>{
  const p=url.parse(req.url).pathname;
  if(p.startsWith('/api/')){
    const handled=await api(req,res,p);
    if(handled!==false)return;
    return send(res,404,{error:'Not found'});
  }
  let file=path.join(ROOT,p==='/'?'index.html':p);
  if(!file.startsWith(ROOT))return send(res,403,{error:'Forbidden'});
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(ROOT,'index.html');
  try{
    const ext=path.extname(file);
    const headers={'Content-Type':mime[ext]||'application/octet-stream'};
    // Force browsers/PWA shells to revalidate the app shell after deploys.
    if(ext==='.html') headers['Cache-Control']='no-store, no-cache, must-revalidate, max-age=0';
    else if(ext==='.js'||ext==='.css') headers['Cache-Control']='no-cache, must-revalidate';
    else if(/chara_bg_102_20260822b\.png$/.test(file)) headers['Cache-Control']='public, max-age=31536000, immutable';
    res.writeHead(200,headers);
    fs.createReadStream(file).pipe(res);
  }catch{send(res,500,{error:'Server error'});}
});
server.listen(PORT,()=>console.log(`Trail Runner Armageddon offline on ${PORT}`));
