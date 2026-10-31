(function(){
var K="rmc_canteen_v2",KM="rmc_my_v1",PIN="1234",TZ="Asia/Manila",LOW=5;
var seed=[["Chicken Adobo Rice Meal","Rice Meals",65,40,30],["Pork Sisig Rice Meal","Rice Meals",70,45,30],["Beef Tapa Rice Meal","Rice Meals",75,48,25],["Hotdog Sandwich","Snacks",25,15,40],["Siomai (4 pcs)","Snacks",30,18,40],["Fries","Snacks",35,20,30],["Iced Tea","Drinks",20,8,50],["Bottled Water","Drinks",15,8,60],["Buko Juice","Drinks",25,14,30]];
var S={menu:[],orders:[]},REP=null,my=[],view="menu",cat="All",cart={},showCart=false,unlocked=false,ready=false,API=false,PINV="",stab="orders",atab="dash",offline=false,lost=false,today=new Date().toDateString();

/* ---------- data layer ---------- */
function route(){var pg=document.body.getAttribute("data-page");if(pg){view=pg;return}var h=location.hash.replace("#","");if(h==="staff")view="staff";else if(h==="admin")view="admin";else if(view==="staff"||view==="admin")view="menu"}
function renumber(){S.orders=S.orders.filter(function(o){return API||o.day===today}).sort(function(a,b){return a.t-b.t||(a.id<b.id?-1:1)});S.orders.forEach(function(o,i){o.no=i+1})}
function seedMenu(){return seed.map(function(r,i){return{id:"m"+(i+1),name:r[0],cat:r[1],price:r[2],cost:r[3],stock:r[4],on:1,ord:i+1}})}
function loadLocal(){var r=null;try{r=JSON.parse(localStorage.getItem(K))}catch(e){}if(!r)r={menu:seedMenu(),orders:[]};S.menu=r.menu;S.orders=r.orders;renumber()}
function save(){if(API)return;try{localStorage.setItem(K,JSON.stringify({menu:S.menu,orders:S.orders}))}catch(e){}}
function saveMy(){try{localStorage.setItem(KM,JSON.stringify(my))}catch(e){}}
function api(url,body){var o={headers:{"Content-Type":"application/json","x-pin":PINV}};if(body!==undefined){o.method="POST";o.body=JSON.stringify(body)}
 return fetch(url,o).then(function(r){if(r.status>=502&&r.status<=504){var d=new Error("Server not ready");d.down=true;throw d}return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Something went wrong");return j})})}
function stateUrl(){return "/api/state?mine="+encodeURIComponent(my.join(","))}
function poll(){var p=api(stateUrl()).then(function(j){S.menu=j.menu;S.orders=j.orders;renumber();ready=true});
 if(view==="admin"&&unlocked&&atab==="dash")p=p.then(function(){return api("/api/report").then(function(r){REP=r.orders})});
 return p.then(function(){lost=false;refresh()}).catch(function(e){if(e&&(e.name==="TypeError"||e.down)){lost=true;refresh()}})}
function start(){api(stateUrl()).then(function(j){API=true;offline=false;S.menu=j.menu;S.orders=j.orders;renumber();ready=true;render();setInterval(poll,3000)}).catch(function(e){if(e&&(e.name==="TypeError"||e.down)&&location.protocol!=="file:"){offline=true;render();setTimeout(start,4000);return}loadLocal();ready=true;render()})}
function refresh(){if(view==="admin"&&unlocked&&atab==="menu")return;var f=document.activeElement;if(!f||f.tagName!=="INPUT")render()}

/* ---------- helpers ---------- */
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function peso(n){n=Math.round(n*100)/100;return "₱"+(n%1?n.toFixed(2):n.toFixed(0))}
function tno(n){return "A-"+String(n).padStart(3,"0")}
function toast(m){var t=document.getElementById("toast");t.textContent=m;t.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(function(){t.style.display="none"},2600)}
function label(s){return{pending:"Waiting",preparing:"Preparing",ready:"Ready",done:"Picked up",cancelled:"Cancelled"}[s]}
function find(id){return S.menu.filter(function(x){return String(x.id)===String(id)})[0]}
function avail(m){return m.on&&m.stock>0}
function cats(){var c=["All"];S.menu.forEach(function(m){if(c.indexOf(m.cat)<0)c.push(m.cat)});return c}
function cartItems(){return S.menu.filter(function(m){return cart[m.id]>0}).map(function(m){return{id:m.id,name:m.name,price:m.price,cost:m.cost||0,qty:cart[m.id]}})}
function cartTotal(){return cartItems().reduce(function(a,i){return a+i.price*i.qty},0)}
function cartCount(){return cartItems().reduce(function(a,i){return a+i.qty},0)}
function active(){return S.orders.filter(function(o){return o.status==="pending"||o.status==="preparing"})}
function stockTag(m){return !m.on?'<span class="tag s-out">Marked sold out</span>':m.stock<=0?'<span class="tag s-out">Sold out</span>':m.stock<=LOW?'<span class="tag s-low">Low: '+m.stock+' left</span>':'<span class="tag s-in">'+m.stock+' in stock</span>'}
function meter(m){var pct=Math.min(100,Math.round(m.stock/40*100));return '<div class="meter"><i class="'+(m.stock<=0?'out':m.stock<=LOW?'low':'')+'" style="width:'+Math.max(pct,m.stock>0?4:0)+'%"></i></div>'}
function fmtDay(d){return /^\d{4}-/.test(d)?new Date(d+"T00:00:00").toLocaleDateString("en-PH",{month:"short",day:"numeric"}):d.slice(4,10)}
function agg(os){var r={orders:0,done:0,rev:0,exp:0,profit:0,items:0,top:{}};
 os.forEach(function(o){if(o.status==="cancelled")return;r.orders++;
  if(o.status==="done"){r.done++;r.rev+=o.total;r.profit+=o.total-o.items.reduce(function(a,i){return a+(i.cost||0)*i.qty},0);
   o.items.forEach(function(i){r.items+=i.qty;var t=r.top[i.name]||(r.top[i.name]={qty:0,rev:0});t.qty+=i.qty;t.rev+=i.price*i.qty})}
  else r.exp+=o.total});return r}

var EMO=[[/adobo|chicken/,"🍗"],[/sisig|pork|bacon/,"🥓"],[/tapa|beef|steak/,"🥩"],[/hot ?dog/,"🌭"],[/siomai|dumpling/,"🥟"],[/fries/,"🍟"],[/burger/,"🍔"],[/pizza/,"🍕"],[/pancit|noodle|mami/,"🍜"],[/spaghetti|pasta/,"🍝"],[/egg/,"🍳"],[/cake|bibingka/,"🍰"],[/coffee/,"☕"],[/\btea\b/,"🧋"],[/buko/,"🥥"],[/juice/,"🧃"],[/water/,"💧"],[/soda|cola|coke/,"🥤"],[/sandwich/,"🥪"],[/rice/,"🍚"]];
function emo(m){var t=(m.name+" "+m.cat).toLowerCase();for(var i=0;i<EMO.length;i++)if(EMO[i][0].test(t))return EMO[i][1];return "🍽️"}
function thumb(m,sm){var src=m.image||(m.imgv?"/img/"+encodeURIComponent(m.id)+"?v="+m.imgv:"");
 return src?'<img class="thumb'+(sm?' sm':'')+'" src="'+esc(src)+'" alt="" loading="lazy">':'<div class="thumb ph'+(sm?' sm':'')+'" aria-hidden="true">'+emo(m)+'</div>'}
function resize(file,cb){var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var M=480,s=Math.min(1,M/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);var x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);cb(c.toDataURL("image/jpeg",.8))};im.onerror=function(){toast("That file isn’t a usable image")};im.src=r.result};r.readAsDataURL(file)}

/* ---------- views ---------- */
function renderNav(){
 var hp=document.querySelector("header p");
 if(view==="staff"||view==="admin"){document.getElementById("nav").innerHTML="";hp.textContent=view==="staff"?"Staff order board":"Admin dashboard";return}
 hp.textContent="Order ahead, get a queue number, pick up when it’s ready.";
 var tabs=[["menu","Menu"],["queue","My queue"]];
 document.getElementById("nav").innerHTML=tabs.map(function(t){return '<button role="tab" aria-selected="'+(view===t[0])+'" data-v="'+t[0]+'">'+t[1]+'</button>'}).join("");
}
function menuView(){
 if(showCart)return cartView();
 var h='<div class="chips" role="group" aria-label="Categories">'+cats().map(function(c){return '<button class="chip" aria-pressed="'+(c===cat)+'" data-cat="'+esc(c)+'">'+esc(c)+'</button>'}).join("")+'</div>';
 var list=S.menu.filter(function(m){return cat==="All"||m.cat===cat});
 h+=list.map(function(m){
  var q=cart[m.id]||0,ok=avail(m);
  var ctl=!ok?'<span class="tag s-out">Sold out</span>':(q?'<div class="qty"><button data-dec="'+m.id+'" aria-label="Remove one">−</button><b>'+q+'</b><button data-inc="'+m.id+'" aria-label="Add one">+</button></div>':'<button class="btn" data-inc="'+m.id+'">Add</button>');
  var left=!ok?'':(m.stock<=LOW?'<span class="tag s-low">Only '+m.stock+' left</span>':'<small>'+m.stock+' left</small>');
  return '<div class="card row '+(ok?'':'off')+'"><div class="lt">'+thumb(m)+'<div class="item"><b>'+esc(m.name)+'</b><small>'+esc(m.cat)+'</small><div class="price">'+peso(m.price)+' '+left+'</div></div></div>'+ctl+'</div>'}).join("");
 if(!list.length)h+='<div class="empty">No items in this category yet.</div>';
 return h;
}
function cartBar(){
 if(view!=="menu"||showCart||!cartCount())return "";
 return '<div class="cartbar"><button class="btn tick" data-act="opencart"><span>View cart · '+cartCount()+' item'+(cartCount()>1?'s':'')+'</span><span>'+peso(cartTotal())+'</span></button></div>';
}
function cartView(){
 var it=cartItems();
 var h='<button class="btn sec" data-act="back">Back to menu</button><h2 style="margin:14px 0 8px">Your order</h2>';
 if(!it.length)return h+'<div class="empty">Your cart is empty. Pick something from the menu.</div>';
 h+=it.map(function(i){return '<div class="card row"><div class="lt">'+thumb(find(i.id),1)+'<div class="item"><b>'+esc(i.name)+'</b><small>'+peso(i.price)+' each</small></div></div><div class="qty"><button data-dec="'+i.id+'" aria-label="Remove one">−</button><b>'+i.qty+'</b><button data-inc="'+i.id+'" aria-label="Add one">+</button></div></div>'}).join("");
 return h+'<div class="card"><div class="row"><b>Total</b><b>'+peso(cartTotal())+'</b></div><label for="nm">Name or student ID</label><input id="nm" autocomplete="name" placeholder="e.g. Juan D. – Grade 10"><p class="note" style="margin:8px 0 0">Pay at the counter when you pick up.</p></div><button class="btn tick" style="width:100%;padding:14px" data-act="place">Place order</button>';
}
function readyList(){return S.orders.filter(function(o){return o.status==="ready"}).map(function(o){return tno(o.no)}).join(", ")}
function queueView(){
 var h='<div class="board"><div class="card"><small>Ready for pickup</small><div class="big">'+(readyList()||"–")+'</div></div><div class="card"><small>Orders in line</small><div class="big">'+active().length+'</div></div></div>';
 var mine=S.orders.filter(function(o){return my.indexOf(o.id)>=0&&o.items}).sort(function(a,b){return b.t-a.t});
 if(!mine.length)return h+'<div class="empty">You have no orders today. Place one from the menu to get a queue number.</div>';
 return h+mine.map(function(o){
  var ahead=active().filter(function(x){return x.t<o.t}).length;
  var msg=o.status==="pending"?(ahead+' order'+(ahead===1?'':'s')+' ahead · about '+Math.max(2,(ahead+1)*3)+' min'):o.status==="preparing"?'Being prepared now':o.status==="ready"?'Ready! Show this number at the counter.':o.status==="done"?'Picked up. Thank you!':'Cancelled.';
  return '<div class="ticket"><div class="row"><div><small>Queue number</small><div class="no">'+tno(o.no)+'</div></div><span class="tag s-'+o.status+'">'+label(o.status)+'</span></div><p style="margin:8px 0 2px"><b>'+msg+'</b></p><small>'+o.items.map(function(i){return i.qty+'× '+esc(i.name)}).join(", ")+' · '+peso(o.total)+'</small>'+(o.status==="pending"?'<div style="margin-top:10px"><button class="btn sec" data-cancel="'+o.id+'">Cancel order</button></div>':'')+'</div>'}).join("");
}
function gate(){return '<div class="card"><h3>'+(view==="admin"?"Admin":"Staff")+' sign-in</h3><label for="pin">PIN</label><input id="pin" type="password" inputmode="numeric" placeholder="Enter PIN"><div style="margin-top:10px"><button class="btn" data-act="unlock">Sign in</button></div></div>'}
function tabsBar(a,cur,key,names){return '<div class="tabs">'+names.map(function(n){return '<button data-'+key+'="'+n[0]+'" aria-pressed="'+(cur===n[0])+'">'+n[1]+'</button>'}).join("")+'</div>'}
function stockAlert(){
 var out=S.menu.filter(function(m){return !avail(m)}),low=S.menu.filter(function(m){return avail(m)&&m.stock<=LOW});
 if(!out.length&&!low.length)return "";
 return '<div class="alert">'+(out.length?'Sold out: '+out.map(function(m){return esc(m.name)}).join(", ")+'. ':'')+(low.length?'Running low: '+low.map(function(m){return esc(m.name)+' ('+m.stock+')'}).join(", ")+'.':'')+'</div>';
}
function boardView(){
 function col(st,title,next,nl){
  var os=S.orders.filter(function(o){return o.status===st&&o.items});
  return '<div><h3 style="margin-bottom:8px">'+title+' ('+os.length+')</h3>'+(os.length?os.map(function(o){
   return '<div class="card"><div class="row"><b class="disp" style="font-size:1.4rem">'+tno(o.no)+'</b><small>'+esc(o.name||"")+'</small></div><div style="margin:6px 0;font-size:.9rem">'+o.items.map(function(i){return i.qty+'× '+esc(i.name)}).join("<br>")+'</div><div class="row"><b>'+peso(o.total)+'</b><div style="display:flex;gap:6px">'+(st!=="ready"?'<button class="btn bad" data-setst="'+o.id+':cancelled">Cancel</button>':'')+'<button class="btn" data-setst="'+o.id+':'+next+'">'+nl+'</button></div></div></div>'}).join(""):'<div class="empty">None</div>')+'</div>'}
 var done=S.orders.filter(function(o){return o.status==="done"});
 return '<div class="board"><div class="card"><small>Picked up today</small><div class="big">'+done.length+'</div></div><div class="card"><small>Sales today</small><div class="big">'+peso(done.reduce(function(a,o){return a+(o.total||0)},0))+'</div></div></div><div class="cols">'+col("pending","Waiting","preparing","Start")+col("preparing","Preparing","ready","Mark ready")+col("ready","Ready","done","Picked up")+'</div>';
}
function stockList(){
 return S.menu.map(function(m){
  return '<div class="card"><div class="row"><div class="lt">'+thumb(m,1)+'<div class="item"><b>'+esc(m.name)+'</b><small>'+esc(m.cat)+' · '+peso(m.price)+'</small></div></div>'+stockTag(m)+'</div>'+meter(m)+'<div style="margin-top:10px"><button class="btn sec" data-avail="'+m.id+'">'+(m.on?'Mark sold out':'Mark available')+'</button></div></div>'}).join("")||'<div class="empty">No menu items yet.</div>';
}
function staffView(){
 if(!unlocked)return gate();
 return tabsBar(0,stab,"stab",[["orders","Orders"],["stock","Inventory"]])+stockAlert()+(stab==="orders"?boardView():'<p class="note" style="margin:0 0 10px">Stock goes down automatically when students order. At 0 the item shows as sold out.</p>'+stockList())+'<div style="margin-top:14px"><button class="btn sec" data-act="lock">Sign out</button></div>';
}
function dashView(){
 var os=API?REP:S.orders;if(!os)return '<div class="empty">Loading…</div>';
 var tk=API?new Date().toLocaleDateString("en-CA",{timeZone:TZ}):today;
 var a=agg(os.filter(function(o){return o.day===tk})),w=agg(os);
 var by={};os.forEach(function(o){(by[o.day]=by[o.day]||[]).push(o)});
 var days=Object.keys(by).sort().slice(-7),rv=days.map(function(d){return agg(by[d]).rev}),mx=Math.max.apply(null,rv.concat([1]));
 var top=Object.keys(w.top).map(function(k){return{n:k,q:w.top[k].qty,r:w.top[k].rev}}).sort(function(x,y){return y.q-x.q}).slice(0,5);
 var h='<div class="dash"><div class="card"><small>Sales today</small><div class="big">'+peso(a.rev)+'</div></div><div class="card"><small>Profit today</small><div class="big">'+peso(a.profit)+'</div></div><div class="card"><small>Still in progress</small><div class="big">'+peso(a.exp)+'</div></div><div class="card"><small>Orders today</small><div class="big">'+a.done+' / '+a.orders+'</div><small>picked up / total</small></div></div>';
 h+='<div class="card"><div class="row"><b>Sales per day</b><small>Last 7 days: '+peso(w.rev)+' sales · '+peso(w.profit)+' profit</small></div>'+(days.length?'<div class="bars">'+days.map(function(d,i){return '<div class="bar"><b>'+peso(rv[i])+'</b><i style="height:'+Math.round(rv[i]/mx*100*.75)+'%"></i><small>'+fmtDay(d)+'</small></div>'}).join("")+'</div>':'<div class="empty">No completed orders yet.'+(API?' Use “Load sample data” below to preview the dashboard.':'')+'</div>')+'</div>';
 h+='<div class="card"><b>Best sellers (last 7 days)</b>'+(top.length?top.map(function(t){return '<div class="top"><span>'+esc(t.n)+'</span><span><b>'+t.q+' sold</b> · '+peso(t.r)+'</span></div>'}).join(""):'<div class="empty">Nothing sold yet.</div>')+'</div>';
 var out=S.menu.filter(function(m){return !avail(m)}),low=S.menu.filter(function(m){return avail(m)&&m.stock<=LOW});
 h+='<div class="card"><b>Stock alerts</b>'+((out.length||low.length)?out.map(function(m){return '<div class="top"><span>'+esc(m.name)+'</span><span class="tag s-out">Sold out</span></div>'}).join("")+low.map(function(m){return '<div class="top"><span>'+esc(m.name)+'</span><span class="tag s-low">'+m.stock+' left</span></div>'}).join(""):'<div class="empty">All items are well stocked.</div>')+'</div>';
 if(API)h+='<div class="card"><b>Sample data</b><p class="note">For demos: fills the last 6 days with made-up completed orders (named “DEMO”). It does not change your stock.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="demo">Load sample data</button><button class="btn sec" data-act="democlear">Remove sample data</button></div></div>';
 return h;
}
function menuAdmin(){
 var h='<div class="card"><h3>Add menu item</h3><label for="an">Name</label><input id="an"><label for="ac">Category</label><input id="ac" list="cl" placeholder="Rice Meals, Snacks, Drinks…"><datalist id="cl">'+cats().filter(function(c){return c!=="All"}).map(function(c){return '<option value="'+esc(c)+'">'}).join("")+'</datalist><div class="grid3"><div><label for="ap">Price (₱)</label><input id="ap" type="number" min="1" inputmode="decimal"></div><div><label for="aco">Cost (₱)</label><input id="aco" type="number" min="0" inputmode="decimal"></div><div><label for="ast">Stock</label><input id="ast" type="number" min="0" inputmode="numeric"></div></div><div style="margin-top:10px"><button class="btn" data-act="additem">Save item</button></div></div><h3 style="margin:14px 0 8px">Menu and stock</h3>';
 h+=S.menu.map(function(m){var hp=m.image||m.imgv;return '<div class="card"><div class="row"><div class="lt">'+thumb(m,1)+'<div class="item"><b>'+esc(m.name)+'</b><small>'+esc(m.cat)+'</small></div></div>'+stockTag(m)+'</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><label class="btn sec" for="im-'+m.id+'" style="cursor:pointer">'+(hp?'Change photo':'Upload photo')+'</label><input id="im-'+m.id+'" data-img="'+m.id+'" type="file" accept="image/*" hidden>'+(hp?'<button class="btn sec" data-rmimg="'+m.id+'">Remove photo</button>':'')+'</div><div class="grid3"><div><label for="st-'+m.id+'">Stock</label><input id="st-'+m.id+'" type="number" min="0" value="'+m.stock+'"></div><div><label for="pr-'+m.id+'">Price</label><input id="pr-'+m.id+'" type="number" min="1" step="any" value="'+m.price+'"></div><div><label for="co-'+m.id+'">Cost</label><input id="co-'+m.id+'" type="number" min="0" step="any" value="'+(m.cost||0)+'"></div></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-save="'+m.id+'">Save changes</button><button class="btn sec" data-avail="'+m.id+'">'+(m.on?'Mark sold out':'Mark available')+'</button><button class="btn bad" data-del="'+m.id+'" aria-label="Delete '+esc(m.name)+'">Delete</button></div></div>'}).join("");
 return h+'<div style="margin-top:14px"><button class="btn bad" data-act="resetday">Clear today’s orders</button></div>';
}
function adminView(){
 if(!unlocked)return gate();
 return tabsBar(0,atab,"atab",[["dash","Dashboard"],["menu","Menu & stock"]])+(atab==="dash"?dashView():menuAdmin())+'<div style="margin-top:14px"><button class="btn sec" data-act="lock">Sign out</button></div>';
}
function render(){
 renderNav();
 document.getElementById("app").innerHTML=(lost?'<div class="alert">Connection lost. Reconnecting…</div>':'')+(!ready?(offline?'<div class="empty"><b>Can’t reach the canteen server right now.</b><br>Check your internet connection. If it keeps happening, tell the canteen staff. Trying again…</div>':'<div class="empty">Loading…<br><small>If the app was idle, the server may take up to a minute to wake up.</small></div>'):view==="menu"?menuView():view==="queue"?queueView():view==="staff"?staffView():adminView());
 document.getElementById("cartslot").innerHTML=cartBar();
}

/* ---------- actions ---------- */
function fail(e){toast(e.message)}
function setSt(id,st){
 if(API){api("/api/orders/"+id+"/status",{status:st}).then(poll).catch(fail);return}
 var o=S.orders.filter(function(x){return x.id===id})[0];if(!o||o.status==="cancelled")return;
 if(st==="cancelled")o.items.forEach(function(i){var m=find(i.id);if(m)m.stock+=i.qty});
 o.status=st;save();render()}
document.addEventListener("click",function(e){
 var t=e.target.closest("button");if(!t)return;var d=t.dataset;
 if(d.v){view=d.v;showCart=false;render();return}
 if(d.cat){cat=d.cat;render();return}
 if(d.stab){stab=d.stab;render();return}
 if(d.atab){atab=d.atab;render();if(API&&atab==="dash")poll().then(function(){render()});return}
 if(d.inc){var m0=find(d.inc);if(!m0||(cart[d.inc]||0)>=m0.stock){toast("Only "+(m0?m0.stock:0)+" left");return}cart[d.inc]=(cart[d.inc]||0)+1;render();return}
 if(d.dec){cart[d.dec]=Math.max(0,(cart[d.dec]||0)-1);render();return}
 if(d.cancel){if(API)api("/api/orders/"+d.cancel+"/cancel",{}).then(poll).catch(fail);else setSt(d.cancel,"cancelled");toast("Order cancelled");return}
 if(d.setst){var p=d.setst.split(":");setSt(p[0],p[1]);return}
 if(d.avail){var m=find(d.avail);m.on=m.on?0:1;if(API)api("/api/menu/"+d.avail,{on:m.on}).then(poll).catch(fail);else{save();render()}return}
 if(d.save){var id=d.save,st=document.getElementById("st-"+id).value,pr=document.getElementById("pr-"+id).value,co=document.getElementById("co-"+id).value;
  if(st===""||+st<0||!(+pr>0)||co===""||+co<0){toast("Check stock, price and cost");return}
  if(API)api("/api/menu/"+id,{stock:+st,price:+pr,cost:+co}).then(function(){toast("Saved");return poll()}).then(function(){render()}).catch(fail);
  else{var mm=find(id);mm.stock=Math.floor(+st);mm.price=+pr;mm.cost=+co;save();render();toast("Saved")}return}
 if(d.del){if(confirm("Delete this item from the menu?")){if(API)api("/api/menu/"+d.del+"/delete",{}).then(poll).catch(fail);else{S.menu=S.menu.filter(function(x){return String(x.id)!==d.del});save();render()}}return}
 if(d.rmimg){if(API)api("/api/menu/"+d.rmimg+"/image/remove",{}).then(function(){toast("Photo removed");return poll()}).then(function(){render()}).catch(fail);else{var mr=find(d.rmimg);delete mr.image;save();render();toast("Photo removed")}return}
 var a=d.act;if(!a)return;
 if(a==="opencart"){showCart=true;render()}
 if(a==="back"){showCart=false;render()}
 if(a==="place"){
  var nm=document.getElementById("nm").value.trim();
  if(!nm){toast("Enter your name or student ID");return}
  var it=cartItems();if(!it.length)return;
  if(API){api("/api/orders",{name:nm,items:it.map(function(i){return{id:i.id,qty:i.qty}})}).then(function(j){my.push(j.id);saveMy();cart={};showCart=false;view="queue";return poll()}).then(function(){render();toast("Order placed. Check My queue for your number.")}).catch(function(e){toast(e.message);poll()});return}
  for(var k=0;k<it.length;k++){var mk=find(it[k].id);if(!mk||!avail(mk)||mk.stock<it[k].qty){toast("Not enough stock for "+it[k].name);return}}
  it.forEach(function(i){find(i.id).stock-=i.qty});
  var tm=Date.now(),o={id:"o"+tm+Math.floor(Math.random()*1e4),t:tm,day:today,name:nm,items:it,total:cartTotal(),status:"pending"};
  S.orders.push(o);renumber();save();my.push(o.id);saveMy();cart={};showCart=false;view="queue";render();toast("Order placed. Check My queue for your number.");
 }
 if(a==="unlock"){var pv=document.getElementById("pin").value;
  if(API){api("/api/auth",{pin:pv,need:view}).then(function(){PINV=pv;unlocked=true;return poll()}).then(function(){render()}).catch(function(){toast("Wrong PIN. Try again.")})}
  else if(pv===PIN){unlocked=true;render()}else toast("Wrong PIN. Try again.")}
 if(a==="lock"){unlocked=false;PINV="";REP=null;render()}
 if(a==="additem"){
  var n=document.getElementById("an").value.trim(),c=document.getElementById("ac").value.trim(),pp=parseFloat(document.getElementById("ap").value),cc=parseFloat(document.getElementById("aco").value||"0"),ss=parseInt(document.getElementById("ast").value||"0",10);
  if(!n||!c||!(pp>0)||!(cc>=0)||!(ss>=0)){toast("Fill in name, category, price, cost and stock");return}
  if(API)api("/api/menu",{name:n,cat:c,price:pp,cost:cc,stock:ss}).then(function(){toast("Item saved");return poll()}).then(function(){render()}).catch(fail);
  else{S.menu.push({id:"m"+Date.now(),name:n,cat:c,price:pp,cost:cc,stock:ss,on:1,ord:Date.now()});save();render();toast("Item saved")}
 }
 if(a==="resetday"){if(confirm("Clear all of today’s orders? Stock from those orders is returned.")){if(API){api("/api/reset",{}).then(poll).catch(fail)}else{S.orders.filter(function(o){return o.status!=="cancelled"}).forEach(function(o){o.items.forEach(function(i){var m=find(i.id);if(m)m.stock+=i.qty})});S.orders=[];save();render()}}}
 if(a==="demo"){api("/api/demo",{}).then(function(){toast("Sample data loaded");return poll()}).then(function(){render()}).catch(fail)}
 if(a==="democlear"){api("/api/demo/clear",{}).then(function(){toast("Sample data removed");return poll()}).then(function(){render()}).catch(fail)}
});
document.addEventListener("change",function(e){var t=e.target,id=t.dataset&&t.dataset.img,f=id&&t.files[0];if(!f)return;
 resize(f,function(url){if(API)api("/api/menu/"+id+"/image",{image:url}).then(function(){toast("Photo saved");return poll()}).then(function(){render()}).catch(fail);else{var m=find(id);m.image=url;save();render();toast("Photo saved")}})});
window.addEventListener("storage",function(e){if(e.key===K&&!API){loadLocal();refresh()}});
setInterval(function(){if(!API&&ready&&(view==="queue"||view==="staff"||view==="admin")){loadLocal();refresh()}},5000);
window.addEventListener("hashchange",function(){route();render()});
var dip=null,ib=document.getElementById("install"),ua=navigator.userAgent,standalone=(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone;
if(ib&&!standalone&&location.protocol.indexOf("http")===0)ib.hidden=false;
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();dip=e});
if(ib)ib.addEventListener("click",function(){
 if(dip){dip.prompt();dip=null;return}
 if(/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\//i.test(ua)){alert("Open this link in Chrome (Android) or Safari (iPhone) first, then tap Install app again. In Messenger or Facebook, tap the menu (⋮ or …) and choose “Open in browser”.");return}
 if(/iPhone|iPad|iPod/i.test(ua)){alert("On iPhone: tap the Share button in Safari, then choose “Add to Home Screen”.");return}
 alert("On Android: tap the ⋮ menu in Chrome, then choose “Install app” or “Add to Home screen”.")});
window.addEventListener("appinstalled",function(){if(ib)ib.hidden=true});
if("serviceWorker" in navigator&&location.protocol.indexOf("http")===0)navigator.serviceWorker.register("sw.js").catch(function(){});
route();try{my=JSON.parse(localStorage.getItem(KM)||"[]")}catch(e){my=[]}render();start();
})();
