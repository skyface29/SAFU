(function(){
"use strict";
var KEY='safu.mirror.v1', mem={};
try{mem=JSON.parse(localStorage.getItem(KEY))||{};}catch(e){}
if(mem.theme)document.documentElement.setAttribute('data-theme',mem.theme);
document.getElementById('themeBtn').onclick=function(){
  var cur=document.documentElement.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
  mem.theme=cur==='light'?'dark':'light';document.documentElement.setAttribute('data-theme',mem.theme);
  try{var m=JSON.parse(localStorage.getItem(KEY))||{};m.theme=mem.theme;localStorage.setItem(KEY,JSON.stringify(m));}catch(e){}};

var chat=document.getElementById('chat'), form=document.getElementById('form'), inp=document.getElementById('inp'), send=document.getElementById('send');
var D=null, E=null, CH={}, CATS=['Сессия','Учёба','Стипендии','Общежитие','Правила'];
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function el(cls,html){var d=document.createElement('div');d.className=cls;d.innerHTML=html;return d;}
function scrollDown(node){setTimeout(function(){(node||chat.lastChild).scrollIntoView({behavior:'smooth',block:'start'});},30);}
function botMsg(html){var m=el('msg bot','<div class="who"><i>С</i>Справочник</div><div class="bubble">'+html+'</div>');chat.appendChild(m);bind(m);return m;}
function meMsg(t){chat.appendChild(el('msg me',esc(t)));}

/* ---------- цитата пункта ---------- */
function src(c){var d=D.docs[c.d];
  if(d.w)return {lab:'Страница «'+esc(d.t)+'»',doc:'сайт narfu.ru, снимок от '+esc(D.snap),url:d.u,page:1};
  return {lab:c.lb?esc(c.lb):(c.pp?(c.pp===1?'Правила поведения':esc(c.pp))+', ':'')+'п. '+esc(c.p),doc:esc(d.t)+' · '+esc(d.a)+(c.o?' · распознано со скана и сверено вручную':''),url:c.u||d.u,note:c.n};}
function table(t){return '<table>'+t.split('\n').map(function(r){return '<tr>'+r.split(' | ').map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'</tr>';}).join('')+'</table>';}
function markWords(html,stems){ // подсветка слов из вопроса (для найденных пунктов без готовых фраз)
  if(!stems)return html;
  return html.replace(/[A-Za-zА-Яа-яЁё]{4,}/g,function(w){var s=E.stem(E.norm(w));
    for(var i=0;i<stems.length;i++){var q=stems[i];if(s===q||(q.length>=4&&s.length>=4&&(s.indexOf(q)===0||q.indexOf(s)===0)))return '<mark>'+w+'</mark>';}return w;});}
var LONG=520;
function quote(id,hl,stems){
  var c=CH[id];if(!c)return '';var s=src(c),t=c.t,full=esc(t),short=null;
  if(c.tb)return '<div class="q"><div class="src"><b>'+s.lab+'</b><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+(s.page?'Открыть страницу ↗':'Открыть документ ↗')+'</a></div><div class="doc">'+s.doc+'</div>'+(s.note?'<div class="note">'+esc(s.note)+'</div>':'')+table(t)+'</div>';
  if(hl&&hl.length){
    hl.forEach(function(h){full=full.split(esc(h)).join('<mark>'+esc(h)+'</mark>');});
    if(t.length>LONG){ // показываем нужные фразы, остальное — по кнопке
      var parts=[],pos=hl.map(function(h){return [t.indexOf(h),h];}).sort(function(a,b){return a[0]-b[0];});
      var last=0;pos.forEach(function(p){if(p[0]>last)parts.push('<span class="gap">… </span>');parts.push('<mark>'+esc(p[1])+'</mark>');last=p[0]+p[1].length;});
      if(last<t.length)parts.push('<span class="gap"> …</span>');short=parts.join('');
    }
  } else {
    full=markWords(full,stems);
    if(t.length>LONG+200){var cut=t.lastIndexOf(' ',LONG);short=markWords(esc(t.slice(0,cut)),stems)+'<span class="gap"> …</span>';}
  }
  return '<div class="q"><div class="src"><b>'+s.lab+'</b><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+(s.page?'Открыть страницу ↗':'Открыть документ ↗')+'</a></div><div class="doc">'+s.doc+'</div>'+(s.note?'<div class="note">'+esc(s.note)+'</div>':'')+
    '<div class="txt" data-full="'+esc(full)+'">'+(short||full)+'</div>'+(short?'<button class="more" data-more>Показать пункт целиком</button>':'')+'</div>';
}
var WARN='<div class="warn">Это дословные цитаты из документов САФУ (снимок от '+'%SNAP%'+'), без пересказа. Документы меняются — перед важным решением открой документ по ссылке или уточни в директорате.</div>';
function tools(q){return '<div class="tools"><button data-share="'+esc(q)+'">Скопировать ссылку на ответ</button></div>';}
function chips(list){return '<div class="chips">'+list.map(function(i){return '<button class="chip" data-card="'+i+'">'+esc(D.cards[i].q)+'</button>';}).join('')+'</div>';}

/* ---------- ответ ---------- */
var HELLO=/^(привет|здравствуй|здравствуйте|добрый|доброе|хай|ку|салам|hello|hi)(?=$|[\s!,.?)])/i, THANKS=/^(спасибо|спс|благодарю|пасиб)/i;
function answerCard(i,q){
  var c=D.cards[i];
  var h='<div class="found">'+(q?'Нашёл ответ на вопрос: <b>'+esc(c.q)+'</b>':'<b>'+esc(c.q)+'</b>')+'</div>';
  c.r.forEach(function(r){h+=quote(r[0],r[1]);});
  return h;
}
function respond(q,cardIdx){
  var res=null,h='';
  if(cardIdx!=null){h=answerCard(cardIdx,'');var rel=E.ask(D.cards[cardIdx].q).cards.filter(function(x){return x.i!==cardIdx&&x.cov>=.5;}).slice(0,3).map(function(x){return x.i;});
    if(rel.length)h+='<div class="also"><div class="t">Ещё по теме</div>'+chips(rel)+'</div>';
    return botMsg(h+WARN+tools(D.cards[cardIdx].q));}
  var s=q.trim();
  if(HELLO.test(s)&&s.split(/\s+/).length<=3)return botMsg('<p>Привет! Задай вопрос про учёбу в САФУ своими словами — например, про пересдачи, академ, стипендию или общежитие.</p>'+chips(popular()));
  if(THANKS.test(s))return botMsg('<p>Пожалуйста! Если что-то ещё — спрашивай.</p>');
  res=E.ask(s);
  var g=res.groups.length, cs=res.cards, top=cs[0], sec=cs[1];
  var stems=[];res.groups.forEach(function(gr){gr.forEach(function(t){stems.push(t);});});
  var ambiguous=top&&g===1&&sec&&sec.s>top.s/1.3;
  var ok=top&&!ambiguous&&(top.cov>=.66||(top.cov>=.5&&top.s>=5));
  if(ok){
    h=answerCard(top.i,s);
    var rel=cs.slice(1).filter(function(x){return x.cov>=.5&&x.s>=top.s*.4;}).slice(0,3).map(function(x){return x.i;});
    var used={};D.cards[top.i].r.forEach(function(r){used[r[0]]=1;});
    var more=res.chunks.filter(function(x){return x.key&&!used[D.chunks[x.i].i]&&x.cov>=.66&&x.s>=top.s*.6;}).slice(0,2);
    if(rel.length)h+='<div class="also"><div class="t">Похожие вопросы</div>'+chips(rel)+'</div>';
    if(more.length)h+='<div class="also"><div class="t">Ещё нашлось в документах</div>'+more.map(function(x){return quote(D.chunks[x.i].i,null,stems);}).join('')+'</div>';
    return botMsg(h+WARN+tools(s));
  }
  if(ambiguous){
    var opts=cs.filter(function(x){return x.s>=top.s*.6;}).slice(0,5).map(function(x){return x.i;});
    return botMsg('<p>Уточни, что именно тебя интересует:</p>'+chips(opts));
  }
  var ck=res.chunks, ctop=ck[0];
  ck=ck.filter(function(x){return x.key;});ctop=ck[0];
  var hits=ctop?ck.filter(function(x){return x.cov>=(g===1?1:.6)&&x.s>=ctop.s*.5;}).slice(0,3):[];
  var maybe=cs.filter(function(x){return x.cov>=.5;}).slice(0,3).map(function(x){return x.i;});
  if(hits.length){
    h='<div class="found">Готового ответа в частых вопросах нет. Вот что сказано в документах:</div>'+hits.map(function(x){return quote(D.chunks[x.i].i,null,stems);}).join('');
    if(maybe.length)h+='<div class="also"><div class="t">Может быть, ты про это</div>'+chips(maybe)+'</div>';
    return botMsg(h+WARN+tools(s));
  }
  return botMsg('<p>Не нашёл ответа в документах, которые у меня есть. Попробуй сказать по-другому — например, «сколько раз можно пересдавать» или «как оформить академ». '+
    'Если вопрос про то, чего нет в положениях (справки, оплата, личные ситуации), лучше спросить в директорате своей высшей школы.</p>'+(maybe.length?chips(maybe):chips(popular())));
}
function popular(){return [0,2,5,6,12].concat(D.cards.map(function(c,i){return i;}).filter(function(i){return /академ|Кто получает академическую|заселиться|опаздывать/.test(D.cards[i].q);})).slice(0,8);}

/* ---------- начало ---------- */
function hello(){
  var cat=mem.spCat||'Сессия';
  var h='<div class="hello"><h1>Спроси про учёбу в САФУ</h1><p class="sub">Отвечаю только цитатами из официальных документов — положений о сессии, отчислении и переводе, правил распорядка, порядка о стипендиях и матпомощи, положения об общежитии. '+
    'Без ИИ и без пересказа: всегда видно, какой это документ и пункт.</p>'+'<p class="warn" style="margin:-4px 0 0">Неофициальный сервис · разработчик <a href="https://t.me/skf29" target="_blank" rel="noopener" style="color:var(--aur1);font-weight:800;text-decoration:none">@skf29</a></p>'+
    '<div class="cats">'+CATS.map(function(c){return '<button data-cat="'+c+'"'+(c===cat?' class="on"':'')+'>'+c+'</button>';}).join('')+'<button data-docs>Документы</button></div><div id="catList"></div></div>';
  var m=botMsg(h);fillCat(cat);return m;
}
function fillCat(cat){var box=document.getElementById('catList');if(!box)return;
  box.innerHTML=chips(D.cards.map(function(c,i){return c.c===cat?i:-1;}).filter(function(i){return i>=0;}));bind(box);
  Array.prototype.forEach.call(document.querySelectorAll('[data-cat]'),function(b){b.classList.toggle('on',b.dataset.cat===cat);});}
function docsList(){return botMsg('<p><b>Документы, по которым я отвечаю</b> (снимок от '+esc(D.snap)+'):</p><div class="docs">'+D.docs.map(function(d){
  return '<a href="'+esc(d.u)+'" target="_blank" rel="noopener">'+esc(d.w?'Страница «'+d.t+'»':d.t)+'<small>'+esc(d.a)+'</small></a>';}).join('')+'</div>');}

function bind(root){
  Array.prototype.forEach.call(root.querySelectorAll('[data-card]'),function(b){if(b._b)return;b._b=1;b.onclick=function(){var i=+b.dataset.card;meMsg(D.cards[i].q);var m=respond('',i);scrollDown(m);};});
  Array.prototype.forEach.call(root.querySelectorAll('[data-more]'),function(b){if(b._b)return;b._b=1;b.onclick=function(){var t=b.previousElementSibling;t.innerHTML=t.getAttribute('data-full');b.remove();};});
  Array.prototype.forEach.call(root.querySelectorAll('[data-cat]'),function(b){if(b._b)return;b._b=1;b.onclick=function(){mem.spCat=b.dataset.cat;try{var m=JSON.parse(localStorage.getItem(KEY))||{};m.spCat=mem.spCat;localStorage.setItem(KEY,JSON.stringify(m));}catch(e){}fillCat(b.dataset.cat);};});
  Array.prototype.forEach.call(root.querySelectorAll('[data-docs]'),function(b){if(b._b)return;b._b=1;b.onclick=function(){var m=docsList();scrollDown(m);};});
  Array.prototype.forEach.call(root.querySelectorAll('[data-share]'),function(b){if(b._b)return;b._b=1;b.onclick=function(){
    var u=location.origin+location.pathname+'?q='+encodeURIComponent(b.dataset.share);
    (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){b.textContent='Ссылка скопирована ✓';},function(){prompt('Ссылка на ответ:',u);});};});
}
form.onsubmit=function(e){e.preventDefault();var q=inp.value.trim();if(!q||!D)return;inp.value='';meMsg(q);var m=respond(q);scrollDown(m);
  try{history.replaceState(null,'','?q='+encodeURIComponent(q));}catch(e){}};

send.disabled=true;
chat.innerHTML='<div class="msg bot"><div class="bubble"><div class="skeleton" style="height:90px"></div></div></div>';
fetch('data/spravka.json').then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(d){
  D=d;D.chunks.forEach(function(c){CH[c.i]=c;});E=makeEngine(D);WARN=WARN.replace('%SNAP%',esc(D.snap));
  chat.innerHTML='';hello();send.disabled=false;
  var q=new URLSearchParams(location.search).get('q');
  if(q){meMsg(q);var m=respond(q);scrollDown(m);}
}).catch(function(){chat.innerHTML='<div class="card">Не получилось загрузить справочник. Проверь интернет и обнови страницу.</div>';});
})();
