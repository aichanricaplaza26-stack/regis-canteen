// Regis Marie College Canteen server. Run: node server.js
// Storage: MySQL when DATABASE_URL (or DB_HOST) is set, otherwise a local data.json file.
const http=require("http"),fs=require("fs"),path=require("path"),os=require("os");
const PORT=process.env.PORT||3000,STAFF_PIN=process.env.STAFF_PIN||"1234",ADMIN_PIN=process.env.ADMIN_PIN||"4321";
const TZ=process.env.TIMEZONE||"Asia/Manila";
const dayStr=(off=0)=>new Date(Date.now()-off*864e5).toLocaleDateString("en-CA",{timeZone:TZ});
const today=()=>dayStr(0);
const m=(id,name,cat,price,cost,stock)=>({id:"m"+id,name,cat,price,cost,stock,on:1,ord:id});
const SEED=[m(1,"Chicken Adobo Rice Meal","Rice Meals",65,40,30),m(2,"Pork Sisig Rice Meal","Rice Meals",70,45,30),m(3,"Beef Tapa Rice Meal","Rice Meals",75,48,25),m(4,"Hotdog Sandwich","Snacks",25,15,40),m(5,"Siomai (4 pcs)","Snacks",30,18,40),m(6,"Fries","Snacks",35,20,30),m(7,"Iced Tea","Drinks",20,8,50),m(8,"Bottled Water","Drinks",15,8,60),m(9,"Buko Juice","Drinks",25,14,30)];
const STATUSES=["pending","preparing","ready","done","cancelled"];

function jsonStore(){
 const FILE=path.join(process.env.DATA_DIR||__dirname,"data.json");
 let db;try{db=JSON.parse(fs.readFileSync(FILE,"utf8"))}catch(e){db={menu:SEED.map(x=>({...x})),orders:[]}}
 db.menu.forEach(x=>{if(x.stock==null)x.stock=50;if(x.cost==null)x.cost=0});db.images=db.images||{};
 const save=()=>fs.writeFileSync(FILE,JSON.stringify(db,null,1));
 const menu=async()=>db.menu.slice().sort((a,b)=>a.ord-b.ord);
 const find=id=>db.menu.find(y=>y.id===id);
 const restore=o=>o.items.forEach(i=>{const x=find(i.id);if(x)x.stock+=i.qty});
 return{name:"JSON file (data.json)",menu,
  state:async()=>({menu:await menu(),orders:db.orders.filter(o=>o.day===today())}),
  orders:async from=>db.orders.filter(o=>o.day>=from),
  addOrder:async(o,demo)=>{if(!demo){for(const i of o.items){const x=find(i.id);if(!x||!x.on||x.stock<i.qty)return false}o.items.forEach(i=>{find(i.id).stock-=i.qty})}db.orders.push(o);save();return true},
  changeStatus:async(id,st,onlyPending)=>{const o=db.orders.find(x=>x.id===id);if(!o||o.status==="cancelled"||(onlyPending&&o.status!=="pending"))return false;if(st==="cancelled")restore(o);o.status=st;save();return true},
  addMenu:async it=>{db.menu.push(it);save()},
  updateMenu:async(id,f)=>{const x=find(id);if(!x)return false;Object.assign(x,f);save();return true},
  delMenu:async id=>{const i=db.menu.findIndex(y=>y.id===id);if(i<0)return false;db.menu.splice(i,1);delete db.images[id];save();return true},
  getImage:async id=>db.images[id]||null,
  setImage:async(id,data)=>{const x=find(id);if(!x)return false;if(data){db.images[id]=data;x.imgv=Date.now()}else{delete db.images[id];x.imgv=0}save();return true},
  resetToday:async()=>{db.orders.filter(o=>o.day===today()&&o.status!=="cancelled").forEach(restore);db.orders=db.orders.filter(o=>o.day!==today());save()},
  clearDemo:async()=>{db.orders=db.orders.filter(o=>!o.name.startsWith("DEMO "));save()}};
}

async function mysqlStore(){
 const mysql=require("mysql2/promise");
 const cfg=process.env.DATABASE_URL?{uri:process.env.DATABASE_URL}:{host:process.env.DB_HOST,port:+(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME};
 const pool=mysql.createPool({...cfg,waitForConnections:true,connectionLimit:10,decimalNumbers:true,charset:"utf8mb4",ssl:process.env.DB_SSL==="true"?{rejectUnauthorized:true,ca:process.env.DB_SSL_CA||undefined}:undefined});
 await pool.query("SELECT 1");
 await pool.query(`CREATE TABLE IF NOT EXISTS menu_items(id VARCHAR(40) NOT NULL PRIMARY KEY,name VARCHAR(60) NOT NULL,cat VARCHAR(30) NOT NULL,price DECIMAL(10,2) NOT NULL,cost DECIMAL(10,2) NOT NULL DEFAULT 0,stock INT NOT NULL DEFAULT 50,is_on TINYINT(1) NOT NULL DEFAULT 1,ord BIGINT NOT NULL DEFAULT 0,image MEDIUMTEXT NULL,imgv BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await pool.query(`CREATE TABLE IF NOT EXISTS orders(id VARCHAR(40) NOT NULL PRIMARY KEY,t BIGINT NOT NULL,day VARCHAR(10) NOT NULL,name VARCHAR(60) NOT NULL,total DECIMAL(10,2) NOT NULL,status VARCHAR(12) NOT NULL DEFAULT 'pending',INDEX idx_orders_day(day)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await pool.query(`CREATE TABLE IF NOT EXISTS order_items(order_id VARCHAR(40) NOT NULL,item_id VARCHAR(40) NOT NULL,name VARCHAR(60) NOT NULL,price DECIMAL(10,2) NOT NULL,cost DECIMAL(10,2) NOT NULL DEFAULT 0,qty INT NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 const addCol=async(t,c,def)=>{const [r]=await pool.query("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?",[t,c]);if(!r[0].n)await pool.query(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`)};
 await addCol("menu_items","cost","DECIMAL(10,2) NOT NULL DEFAULT 0");
 await addCol("menu_items","stock","INT NOT NULL DEFAULT 50");
 await addCol("order_items","cost","DECIMAL(10,2) NOT NULL DEFAULT 0");
 await addCol("menu_items","image","MEDIUMTEXT NULL");
 await addCol("menu_items","imgv","BIGINT NOT NULL DEFAULT 0");
 const [[c]]=await pool.query("SELECT COUNT(*) AS n FROM menu_items");
 if(!c.n)await pool.query("INSERT INTO menu_items(id,name,cat,price,cost,stock,is_on,ord) VALUES ?",[SEED.map(x=>[x.id,x.name,x.cat,x.price,x.cost,x.stock,x.on,x.ord])]);
 const menu=async()=>{const [r]=await pool.query("SELECT id,name,cat,price,cost,stock,is_on,ord,imgv FROM menu_items ORDER BY ord");return r.map(x=>({id:x.id,name:x.name,cat:x.cat,price:+x.price,cost:+x.cost,stock:x.stock,on:x.is_on?1:0,ord:+x.ord,imgv:+x.imgv}))};
 const load=async(where,params)=>{
  const [os]=await pool.query("SELECT id,t,day,name,total,status FROM orders WHERE "+where+" ORDER BY t,id",params);
  const by={};os.forEach(o=>by[o.id]=[]);
  if(os.length){const [its]=await pool.query("SELECT order_id,item_id,name,price,cost,qty FROM order_items WHERE order_id IN (?)",[os.map(o=>o.id)]);its.forEach(i=>by[i.order_id].push({id:i.item_id,name:i.name,price:+i.price,cost:+i.cost,qty:i.qty}))}
  return os.map(o=>({id:o.id,t:+o.t,day:o.day,name:o.name,total:+o.total,status:o.status,items:by[o.id]}))};
 const FIELD={on:"is_on",stock:"stock",price:"price",cost:"cost"};
 return{name:"MySQL",menu,
  state:async()=>({menu:await menu(),orders:await load("day=?",[today()])}),
  orders:from=>load("day>=?",[from]),
  addOrder:async(o,demo)=>{const c=await pool.getConnection();try{await c.beginTransaction();
    if(!demo)for(const i of o.items){const [r]=await c.query("UPDATE menu_items SET stock=stock-? WHERE id=? AND is_on=1 AND stock>=?",[i.qty,i.id,i.qty]);if(!r.affectedRows){await c.rollback();return false}}
    await c.query("INSERT INTO orders(id,t,day,name,total,status) VALUES (?,?,?,?,?,?)",[o.id,o.t,o.day,o.name,o.total,o.status]);
    await c.query("INSERT INTO order_items(order_id,item_id,name,price,cost,qty) VALUES ?",[o.items.map(i=>[o.id,i.id,i.name,i.price,i.cost||0,i.qty])]);
    await c.commit();return true}catch(e){await c.rollback();throw e}finally{c.release()}},
  changeStatus:async(id,st,onlyPending)=>{const c=await pool.getConnection();try{await c.beginTransaction();
    const [r]=await c.query("SELECT status FROM orders WHERE id=? FOR UPDATE",[id]);
    if(!r.length||r[0].status==="cancelled"||(onlyPending&&r[0].status!=="pending")){await c.rollback();return false}
    await c.query("UPDATE orders SET status=? WHERE id=?",[st,id]);
    if(st==="cancelled")await c.query("UPDATE menu_items mi JOIN order_items oi ON oi.item_id=mi.id SET mi.stock=mi.stock+oi.qty WHERE oi.order_id=?",[id]);
    await c.commit();return true}catch(e){await c.rollback();throw e}finally{c.release()}},
  addMenu:async it=>{await pool.query("INSERT INTO menu_items(id,name,cat,price,cost,stock,is_on,ord) VALUES (?,?,?,?,?,?,1,?)",[it.id,it.name,it.cat,it.price,it.cost,it.stock,it.ord])},
  updateMenu:async(id,f)=>{const ks=Object.keys(f).filter(k=>FIELD[k]);if(!ks.length)return false;return(await pool.query("UPDATE menu_items SET "+ks.map(k=>FIELD[k]+"=?").join(",")+" WHERE id=?",[...ks.map(k=>f[k]),id]))[0].affectedRows>0},
  delMenu:async id=>(await pool.query("DELETE FROM menu_items WHERE id=?",[id]))[0].affectedRows>0,
  getImage:async id=>{const [r]=await pool.query("SELECT image FROM menu_items WHERE id=?",[id]);return r.length&&r[0].image||null},
  setImage:async(id,data)=>(await pool.query("UPDATE menu_items SET image=?,imgv=? WHERE id=?",[data||null,data?Date.now():0,id]))[0].affectedRows>0,
  resetToday:async()=>{
   await pool.query("UPDATE menu_items mi JOIN (SELECT oi.item_id,SUM(oi.qty) q FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.day=? AND o.status<>'cancelled' GROUP BY oi.item_id) s ON s.item_id=mi.id SET mi.stock=mi.stock+s.q",[today()]);
   await pool.query("DELETE FROM orders WHERE day=?",[today()])},
  clearDemo:async()=>{await pool.query("DELETE FROM orders WHERE name LIKE 'DEMO %'")}};
}

const STATIC={"/":"index.html","/index.html":"index.html","/staff":"staff.html","/staff.html":"staff.html","/admin":"admin.html","/admin.html":"admin.html","/style.css":"style.css","/script.js":"script.js"};
const TYPES={".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript"};
const role=r=>{const p=r.headers["x-pin"];return p===ADMIN_PIN?"admin":p===STAFF_PIN?"staff":null};
const send=(res,c,o)=>{res.writeHead(c,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(o))};
const body=(r,lim=2e4)=>new Promise(ok=>{let b="";r.on("data",c=>{b+=c;if(b.length>lim)r.destroy()});r.on("end",()=>{try{ok(JSON.parse(b||"{}"))}catch(e){ok({})}})});
const num=(v,min,max)=>{v=+v;return Number.isFinite(v)&&v>=min&&v<=max?v:null};

// Public data hides other students' names/items and the cost of each item.
function view(st,R,mine){
 return{menu:st.menu.map(x=>{const y={...x};if(R!=="admin")delete y.cost;return y}),
  orders:st.orders.map(o=>(R||mine.includes(o.id))?{...o,items:(o.items||[]).map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty}))}:{id:o.id,t:o.t,day:o.day,status:o.status})}}

async function demo(S){
 const menu=(await S.menu()).filter(x=>x.on);if(!menu.length)return 0;let n=0;
 for(let d=6;d>=1;d--){const k=12+Math.floor(Math.random()*20);
  for(let j=0;j<k;j++){
   const pick=menu.slice().sort(()=>Math.random()-.5).slice(0,1+Math.floor(Math.random()*3));
   const items=pick.map(x=>({id:x.id,name:x.name,price:x.price,cost:x.cost,qty:1+Math.floor(Math.random()*2)}));
   const t=Date.now()-d*864e5-Math.floor(Math.random()*6*36e5);
   await S.addOrder({id:"od"+t+"x"+(n++),t,day:dayStr(d),name:"DEMO "+(j+1),items,total:items.reduce((a,i)=>a+i.price*i.qty,0),status:"done"},true)}}
 return n}

function makeHandler(S){return async(req,res)=>{
 res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Headers","Content-Type, x-pin");res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
 if(req.method==="OPTIONS"){res.writeHead(204);return res.end()}
 const u=new URL(req.url,"http://x"),url=u.pathname;
 if(req.method==="GET"&&STATIC[url]){const f=STATIC[url];res.writeHead(200,{"Content-Type":TYPES[path.extname(f)],"Cache-Control":"no-cache"});return res.end(fs.readFileSync(path.join(__dirname,f)))}
 if(req.method==="GET"&&url.startsWith("/img/")){const im=await S.getImage(decodeURIComponent(url.slice(5)));const mt=im&&/^data:(image\/\w+);base64,(.*)$/.exec(im);if(!mt){res.writeHead(404);return res.end()}res.writeHead(200,{"Content-Type":mt[1],"Cache-Control":"public, max-age=31536000, immutable"});return res.end(Buffer.from(mt[2],"base64"))}
 if(!url.startsWith("/api/"))return send(res,404,{error:"Not found"});
 const R=role(req),b=req.method==="POST"?await body(req,/^\/api\/menu\/[^/]+\/image/.test(url)?6e5:2e4):{},p=url.split("/").slice(2);
 if(url==="/api/state"){const mine=(u.searchParams.get("mine")||"").split(",").filter(Boolean).slice(0,50);return send(res,200,view(await S.state(),R,mine))}
 if(url==="/api/auth"){const r=b.pin===ADMIN_PIN?"admin":b.pin===STAFF_PIN?"staff":null;return r&&(b.need!=="admin"||r==="admin")?send(res,200,{ok:1}):send(res,401,{error:"Wrong PIN"})}
 if(url==="/api/report"){if(R!=="admin")return send(res,401,{error:"Admin sign-in required"});return send(res,200,{orders:await S.orders(dayStr(6))})}
 if(url==="/api/orders"&&req.method==="POST"){
  const name=String(b.name||"").trim().slice(0,60);if(!name)return send(res,400,{error:"Enter your name or student ID"});
  const menu=await S.menu(),items=[];
  for(const x of(Array.isArray(b.items)?b.items:[])){const mi=menu.find(y=>y.id===x.id),q=Math.floor(+x.qty);if(!mi||!(q>0&&q<=20))continue;
   if(!mi.on||mi.stock<=0)return send(res,400,{error:mi.name+" is sold out. Please update your cart."});
   if(mi.stock<q)return send(res,400,{error:"Only "+mi.stock+" left of "+mi.name+"."});
   items.push({id:mi.id,name:mi.name,price:mi.price,cost:mi.cost,qty:q})}
  if(!items.length)return send(res,400,{error:"Your items are no longer available"});
  const t=Date.now(),o={id:"o"+t+Math.floor(Math.random()*1e4),t,day:today(),name,items,total:items.reduce((a,i)=>a+i.price*i.qty,0),status:"pending"};
  if(!(await S.addOrder(o)))return send(res,400,{error:"Someone just took the last stock. Please check the menu again."});
  return send(res,200,{id:o.id})}
 if(p[0]==="orders"&&p[2]==="cancel"){if(!(await S.changeStatus(p[1],"cancelled",true)))return send(res,400,{error:"Order can’t be cancelled anymore"});return send(res,200,{ok:1})}
 if(p[0]==="orders"&&p[2]==="status"){if(!R)return send(res,401,{error:"Sign in first"});
  if(!STATUSES.includes(b.status)||!(await S.changeStatus(p[1],b.status,false)))return send(res,400,{error:"Invalid update"});return send(res,200,{ok:1})}
 if(p[0]==="menu"&&p[1]&&!p[2]&&R==="staff"&&Object.keys(b).join()==="on"){return(await S.updateMenu(p[1],{on:b.on?1:0}))?send(res,200,{ok:1}):send(res,404,{error:"Item not found"})}
 if(p[0]==="menu"||url==="/api/reset"||p[0]==="demo"){
  if(R!=="admin")return send(res,401,{error:"Admin sign-in required"});
  if(url==="/api/reset"){await S.resetToday();return send(res,200,{ok:1})}
  if(url==="/api/demo"){return send(res,200,{ok:1,orders:await demo(S)})}
  if(url==="/api/demo/clear"){await S.clearDemo();return send(res,200,{ok:1})}
  if(p[1]&&p[2]==="image"){
   if(p[3]==="remove")return(await S.setImage(p[1],null))?send(res,200,{ok:1}):send(res,404,{error:"Item not found"});
   const im=String(b.image||"");if(im.length>5e5||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(im))return send(res,400,{error:"Photo is too big or not a JPG, PNG or WebP image"});
   return(await S.setImage(p[1],im))?send(res,200,{ok:1}):send(res,404,{error:"Item not found"})}
  if(!p[1]){const price=num(b.price,0.01,100000),cost=num(b.cost||0,0,100000),stock=num(b.stock||0,0,100000);
   if(!b.name||!b.cat||price==null||cost==null||stock==null)return send(res,400,{error:"Fill in name, category, price, cost and stock"});
   await S.addMenu({id:"m"+Date.now(),name:String(b.name).slice(0,60),cat:String(b.cat).slice(0,30),price,cost,stock:Math.floor(stock),on:1,ord:Date.now()});return send(res,200,{ok:1})}
  if(p[2]==="delete")return(await S.delMenu(p[1]))?send(res,200,{ok:1}):send(res,404,{error:"Item not found"});
  const f={};
  if("on"in b)f.on=b.on?1:0;
  if("stock"in b){const v=num(b.stock,0,100000);if(v==null)return send(res,400,{error:"Stock must be 0 or more"});f.stock=Math.floor(v)}
  if("price"in b){const v=num(b.price,0.01,100000);if(v==null)return send(res,400,{error:"Enter a valid price"});f.price=v}
  if("cost"in b){const v=num(b.cost,0,100000);if(v==null)return send(res,400,{error:"Enter a valid cost"});f.cost=v}
  return(await S.updateMenu(p[1],f))?send(res,200,{ok:1}):send(res,404,{error:"Item not found"})}
 send(res,404,{error:"Not found"})
}}

(async()=>{
 let S;try{S=(process.env.DATABASE_URL||process.env.DB_HOST)?await mysqlStore():jsonStore()}
 catch(e){console.error("\nCould not start the database: "+e.message+"\nCheck DATABASE_URL / DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (and run: npm install).\n");process.exit(1)}
 const h=makeHandler(S);
 http.createServer((q,r)=>h(q,r).catch(e=>{console.error(e);if(!r.headersSent)send(r,500,{error:"Server error. Try again."})})).listen(PORT,"0.0.0.0",()=>{
  console.log("\nCanteen system running. Storage: "+S.name+"\n  On this computer: http://localhost:"+PORT);
  for(const l of Object.values(os.networkInterfaces()))for(const a of l)if(a.family==="IPv4"&&!a.internal)console.log("  On phones (same Wi-Fi): http://"+a.address+":"+PORT);
  console.log("\n  Students: /    Staff: /staff    Admin: /admin\n")})
})();
