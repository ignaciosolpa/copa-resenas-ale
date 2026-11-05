// Arma docs/index.html: los datos van en un JSON y la página los dibuja (con la marca de Olpa).
import fs from 'node:fs/promises';

export async function armarHTML(store, { CFG, hoy, cuenta }) {
  let logo = '';
  try {
    logo = 'data:image/png;base64,' + (await fs.readFile('marca/olpa-logo-blanco.png')).toString('base64');
  } catch {}

  const resenas = Object.values(store.resenas)
    .filter((r) => !r.eliminada)
    .sort((a, b) => (b.fecha > a.fecha ? 1 : -1))
    .map((r) => ({
      f: r.fecha,
      d: r.dia,
      s: r.estrellas,
      t: r.texto,
      n: (r.autor || '').split(' ')[0] || 'Cliente',
      ar: r.areas || [],
      c: r.colaboradores || [],
      k: r.antigua ? 'editada' : cuenta(r) ? 'si' : r.estrellas < CFG.regla.estrellas_minimas ? 'baja' : 'sintexto',
    }));

  const datos = {
    hoy,
    actualizado: store.ultima_ok || new Date().toISOString(),
    ficha: store.ficha,
    inicio: CFG.inicio,
    objetivo: CFG.objetivo_general,
    tramos: CFG.tramos,
    areas: CFG.areas.map((a) => ({ id: a.id, nombre: a.nombre, icono: a.icono || '•' })),
    resenas,
  };
  const json = JSON.stringify(datos).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Copa de Reseñas · ALE</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#07070C">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap">
<style>
:root{--bg:#07070C;--panel:#12121C;--panel2:#1A1A28;--line:#262636;--text:#F4F4F6;--muted:#9F9FA2;--faint:#6F6F75;
--brand:#FFD60A;--brand2:#00E5FF;--ok:#3DDC97;--bad:#F47C7C;--plata:#C9CED6;--bronce:#D99A5B;--r:20px}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 Inter,system-ui,-apple-system,sans-serif;
background-image:radial-gradient(900px 500px at 85% -10%,rgba(255,214,10,.10),transparent 60%),radial-gradient(700px 400px at -10% 20%,rgba(0,229,255,.07),transparent 60%);background-attachment:fixed}
main{max-width:1080px;margin:0 auto;padding:16px}
h1,h2,h3,.num{font-family:"Space Grotesk",Inter,sans-serif}
h2{font-size:18px;margin:0 0 14px;display:flex;align-items:center;gap:8px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:20px;margin-top:14px}
.top{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:6px 2px 4px}
.top img{height:40px}.top .tit{flex:1;min-width:200px}
.kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.top h1{margin:2px 0 0;font-size:28px;line-height:1.1}.top h1 b{color:var(--brand)}
.live{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:8px 14px;font-size:13px;color:var(--muted)}
.live b{color:var(--text)}.dot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 rgba(61,220,151,.6);animation:pulso 2s infinite}
.live.viejo .dot{background:var(--bad);animation:none}
@keyframes pulso{70%{box-shadow:0 0 0 8px rgba(61,220,151,0)}100%{box-shadow:0 0 0 0 rgba(61,220,151,0)}}
.aviso{background:rgba(244,124,124,.12);border:1px solid rgba(244,124,124,.4);color:var(--bad);border-radius:14px;padding:12px 16px;margin-top:12px;font-weight:600}
/* héroe */
.hero{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:24px;align-items:center;
background:linear-gradient(135deg,#17172A,#101018);position:relative;overflow:hidden}
.hero:after{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;border:28px solid rgba(255,214,10,.06)}
.anillo{position:relative;width:100%;max-width:280px;aspect-ratio:1;margin:0 auto}
.anillo svg{width:100%;height:100%;transform:rotate(-90deg)}
.anillo .centro{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.anillo .grande{font-size:64px;font-weight:700;line-height:1}.anillo .de{color:var(--muted);font-size:14px;margin-top:6px}
.anillo .mes{display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:var(--bg);background:var(--brand);border-radius:99px;padding:3px 10px}
.estado{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:18px;border-radius:14px;padding:10px 14px}
.estado.ok{background:rgba(61,220,151,.12);color:var(--ok)}.estado.mal{background:rgba(244,124,124,.12);color:var(--bad)}.estado.neutro{background:var(--panel2);color:var(--muted)}
.hero p.sub{color:var(--muted);margin:10px 0 16px}.hero p.sub b{color:var(--text)}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.tile{background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:14px;padding:12px}
.tile .num{font-size:26px;font-weight:700;display:block;line-height:1.1}.tile span{font-size:12px;color:var(--muted)}
.leyenda{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:12px}
.leyenda i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
/* camino */
.camino .pista{position:relative;height:56px;margin:34px 6px 30px}
.camino .base{position:absolute;left:0;right:0;top:20px;height:16px;border-radius:99px;background:var(--panel2);overflow:hidden}
.camino .lleno{height:100%;background:linear-gradient(90deg,#FFB800,var(--brand));border-radius:99px;animation:crece 1.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes crece{from{width:0}}@keyframes corre{from{left:0}}@keyframes arco{from{stroke-dashoffset:var(--c)}}
.camino .hito{position:absolute;top:0;bottom:0;width:2px;background:var(--line)}
.camino .hito span{position:absolute;top:-26px;transform:translateX(-50%);font-size:12px;color:var(--muted);white-space:nowrap}
.camino .hito.ult span,.camino .hito.ult em{transform:translateX(-100%)}.camino .hito i{font-style:normal}
.camino .hito em{position:absolute;bottom:-24px;transform:translateX(-50%);font-style:normal;font-size:12px;font-weight:700;white-space:nowrap}
.camino .corredor{position:absolute;top:8px;transform:translateX(-50%);font-size:26px;animation:corre 1.2s cubic-bezier(.2,.8,.2,1) both;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
.camino .ritmo{position:absolute;top:14px;height:28px;border-left:2px dashed var(--brand2)}
.camino .ritmo b{position:absolute;top:30px;left:-1px;transform:translateX(-50%);font-size:11px;color:var(--brand2);white-space:nowrap}
.tramos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px}
.tramo{border:1px solid var(--line);border-radius:14px;padding:12px;background:rgba(255,255,255,.02)}
.tramo.actual{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand) inset}
.tramo .fila{display:flex;justify-content:space-between;align-items:baseline}.tramo .num{font-size:22px;font-weight:700}
.tramo small{color:var(--muted)}.mini{height:8px;background:var(--panel2);border-radius:99px;overflow:hidden;margin:8px 0}
.mini i{display:block;height:100%;background:var(--brand);border-radius:99px}
.chip{display:inline-block;font-size:11px;font-weight:700;border-radius:99px;padding:2px 8px;background:var(--panel2);color:var(--muted)}
.chip.ok{background:rgba(61,220,151,.14);color:var(--ok)}.chip.mal{background:rgba(244,124,124,.14);color:var(--bad)}
/* pestañas */
.tabs{position:sticky;top:0;z-index:5;display:flex;gap:6px;overflow-x:auto;padding:12px 0;margin-top:6px;background:linear-gradient(var(--bg) 75%,transparent)}
.tabs button{flex:none;font:600 14px Inter,sans-serif;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:9px 16px;cursor:pointer}
.tabs button[aria-selected=true]{color:var(--bg);background:var(--brand);border-color:var(--brand)}
.tabs button:disabled{opacity:.4;cursor:default}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:14px}.dos .card{margin-top:0}
/* podio */
.podio{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:end;gap:8px;height:190px;margin-bottom:12px}
.escalon{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;text-align:center}
.escalon .quien{font-weight:700;font-size:13px;line-height:1.2;margin-bottom:6px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.escalon .ico{font-size:24px}
.escalon .bloque{width:100%;border-radius:12px 12px 4px 4px;display:grid;place-items:center;font-family:"Space Grotesk";font-weight:700;font-size:22px;color:var(--bg);transform-origin:bottom;animation:sube .9s cubic-bezier(.2,.8,.2,1) both}
.escalon .bloque small{display:block;font-size:11px;font-family:Inter;font-weight:600;opacity:.75}
.p1 .bloque{background:var(--brand);height:70%}.p2 .bloque{background:var(--plata);height:52%}.p3 .bloque{background:var(--bronce);height:38%}
.escalon.vacio .bloque{background:var(--panel2);color:var(--faint)}
@keyframes sube{from{transform:scaleY(0)}to{transform:scaleY(1)}}
/* tabla de posiciones */
table.pos{width:100%;border-collapse:collapse;font-size:14px}
table.pos th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600;text-align:left;padding:6px 6px;border-bottom:1px solid var(--line)}
table.pos td{padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
table.pos tr:last-child td{border-bottom:0}
table.pos .p{width:34px;text-align:center;font-family:"Space Grotesk";font-weight:700}
table.pos .m{width:46px;text-align:right;font-family:"Space Grotesk";font-weight:700;font-size:16px}
table.pos .barra{width:38%}.barra div{height:8px;background:var(--panel2);border-radius:99px;overflow:hidden}
.barra i{display:block;height:100%;background:var(--brand);border-radius:99px;animation:crece .9s cubic-bezier(.2,.8,.2,1) both}
tr.lider td{background:rgba(255,214,10,.05)}
.vacio{color:var(--faint);font-style:italic;padding:8px 0}
/* gráfico */
.grafico{position:relative}.grafico svg{width:100%;height:auto;display:block}
.tip{position:absolute;pointer-events:none;background:#000;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:12px;white-space:nowrap;opacity:0;transition:opacity .15s;transform:translate(-50%,-110%)}
.tip b{color:var(--brand)}
/* segmentos */
.segs{display:flex;height:22px;border-radius:99px;overflow:hidden;gap:2px;background:var(--panel)}
.res p{white-space:pre-line}
.segs i{display:block;height:100%;transition:flex .8s}
.cuentan{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
/* reseñas */
.filtros{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.filtros button{font:600 13px Inter;color:var(--muted);background:var(--panel2);border:1px solid var(--line);border-radius:99px;padding:6px 12px;cursor:pointer}
.filtros button[aria-pressed=true]{color:var(--text);border-color:var(--brand)}
.res{display:grid;grid-template-columns:40px 1fr;gap:12px;padding:14px 0;border-top:1px solid var(--line)}
.res:first-of-type{border-top:0}
.av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:var(--panel2);color:var(--brand)}
.res .cab{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.res .cab .n{font-weight:700}.res .cab .f{color:var(--faint);font-size:12px}
.est{color:var(--brand);letter-spacing:1px;font-size:13px}.est .off{color:var(--faint)}
.res p{margin:4px 0 6px}.res p.sin{color:var(--faint);font-style:italic}
.tags{display:flex;gap:6px;flex-wrap:wrap}.tag{font-size:12px;padding:2px 9px;border-radius:99px;background:var(--panel2);color:var(--muted)}
.tag.col{color:var(--brand2);background:rgba(0,229,255,.08)}
.mas{display:block;margin:10px auto 0;font:600 14px Inter;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:99px;padding:9px 18px;cursor:pointer}
details.reglas summary{cursor:pointer;font-weight:700}details.reglas ul{color:var(--muted);padding-left:18px}
footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--faint);font-size:12px;padding:20px 2px 30px}
footer img{height:22px;opacity:.8}
@media (max-width:820px){.hero{grid-template-columns:1fr}.tiles{grid-template-columns:repeat(2,1fr)}.dos{grid-template-columns:1fr}.tramos{grid-template-columns:1fr}}
@media (max-width:600px){.camino .hito i.fecha{display:none}}
@media (max-width:420px){.top h1{font-size:23px}.anillo .grande{font-size:52px}.card{padding:16px}table.pos .barra{width:28%}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body><main>

<header class="top">
  ${logo ? `<img src="${logo}" alt="Olpa Group">` : ''}
  <div class="tit"><div class="kicker">ALE Centro de Compras · Programa de reseñas</div><h1>La Copa de <b>Reseñas</b> 🏆</h1></div>
  <div class="live" id="live"><span class="dot"></span><span>Actualizado <b id="act"></b></span></div>
</header>
<div class="aviso" id="aviso" hidden>⚠️ Hoy todavía no se actualizó. Los números son de la última actualización.</div>

<section class="card hero" aria-label="Objetivo del mes">
  <div class="anillo" id="anillo"></div>
  <div>
    <div class="kicker" id="heroKicker"></div>
    <div id="heroEstado" style="margin-top:8px"></div>
    <p class="sub" id="heroSub"></p>
    <div class="tiles" id="heroTiles"></div>
    <div class="leyenda"><span><i style="background:var(--brand)"></i>Reseñas que cuentan</span><span><i style="background:var(--brand2)"></i>Donde deberíamos estar hoy</span></div>
  </div>
</section>

<section class="card camino" aria-label="Objetivo general">
  <h2>🏁 Camino a las <span id="objGral"></span> reseñas</h2>
  <div class="pista" id="pista"></div>
  <div class="tramos" id="tramos"></div>
</section>

<nav class="tabs" role="tablist" id="tabs" aria-label="Período"></nav>

<div class="dos">
  <section class="card"><h2>🏆 Tabla de posiciones · Áreas</h2><div class="podio" id="podioAreas"></div><table class="pos" id="tablaAreas"></table></section>
  <section class="card"><h2>⭐ Tabla de posiciones · Colaboradores</h2><div class="podio" id="podioColab"></div><table class="pos" id="tablaColab"></table></section>
</div>

<section class="card"><h2>📅 Reseñas por día</h2><div class="grafico" id="grafico"><div class="tip" id="tip"></div></div>
  <div class="leyenda"><span><i style="background:var(--brand)"></i>Reseñas que cuentan</span><span><i style="background:transparent;border:2px dashed var(--brand2);width:14px;height:0;border-radius:0"></i><span id="leyRitmo"></span></span></div></section>

<section class="card"><h2>✅ ¿Cuáles cuentan?</h2><div class="segs" id="segs"></div><div class="cuentan" id="cuentan"></div>
  <p style="color:var(--muted);font-size:13px;margin:12px 0 0">Cuenta si tiene <b style="color:var(--text)">texto</b> y <b style="color:var(--text)">4 o 5★</b>. Pedile al cliente que cuente qué compró y quién lo atendió.</p></section>

<section class="card"><h2>💬 Las reseñas</h2><div class="filtros" id="filtros"></div><div id="lista"></div></section>

<section class="card"><details class="reglas"><summary>¿Cómo se cuenta?</summary><ul>
<li>Se toman las reseñas de la ficha de Google de ALE desde el inicio de la Copa.</li>
<li>Cuentan las que tienen texto y 4 o 5 estrellas. Las de 1 a 3★ y las que no tienen texto no suman.</li>
<li>Un área suma cuando la reseña habla de ella (por ejemplo «colchón», «zapatillas», «la entrega») o nombra a alguien de esa área.</li>
<li>Una reseña vieja que el cliente edita no es nueva: aparece en la lista pero no suma.</li>
<li>Si Google borra una reseña, se descuenta.</li>
<li>La página se actualiza sola todos los días a las 11 h.</li></ul></details></section>

<footer><span>Copa de Reseñas · ALE Centro de Compras</span><span style="display:flex;align-items:center;gap:8px">Hecho por ${logo ? `<img src="${logo}" alt="Olpa Group">` : 'Olpa Group'}</span></footer>
</main>

<script id="datos" type="application/json">${json}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('datos').textContent);
var MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'],DIAS=['dom','lun','mar','mié','jue','vie','sáb'];
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function dt(d){return new Date(d+'T12:00:00Z')}
function entre(a,b){return Math.round((dt(b)-dt(a))/864e5)}
function sumar(d,n){return new Date(dt(d).getTime()+n*864e5).toISOString().slice(0,10)}
function fm(d){return d.slice(8,10)+'/'+d.slice(5,7)}
function coma(x){return String(x).replace('.',',')}
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function contar(el,fin){el.textContent=fin;if(reduce||document.hidden)return;var t0=Date.now();function paso(){var p=Math.min(1,(Date.now()-t0)/1100);el.textContent=Math.round(fin*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(paso)}requestAnimationFrame(paso)}

var hoy=D.hoy,fin=D.tramos[D.tramos.length-1].hasta;
var validas=D.resenas.filter(function(r){return r.k==='si'});
function en(lista,desde,hasta){return lista.filter(function(r){return r.d>=desde&&r.d<=hasta})}

// --- actualizado
var h=(Date.now()-Date.parse(D.actualizado))/36e5;
var a=new Date(D.actualizado);
$('act').textContent=h<1?'hace '+Math.max(1,Math.round(h*60))+' min':h<24?'hace '+Math.round(h)+' h':'el '+a.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'});
if(h>26){$('aviso').hidden=false;$('live').classList.add('viejo')}

// --- héroe: el tramo en curso
var actual=D.tramos.filter(function(t){return hoy>=t.desde&&hoy<=t.hasta})[0]||(hoy<D.tramos[0].desde?D.tramos[0]:D.tramos[D.tramos.length-1]);
var nT=en(validas,actual.desde,actual.hasta).length,diasT=entre(actual.desde,actual.hasta)+1;
var pasados=Math.max(0,Math.min(diasT,entre(actual.desde,hoy)+1)),quedan=Math.max(0,entre(hoy,actual.hasta)+1);
var esperado=Math.round(actual.meta*pasados/diasT),dif=nT-esperado,faltan=Math.max(0,actual.meta-nT);
var ayer=en(validas,sumar(hoy,-1),sumar(hoy,-1)).length,hoyN=en(validas,hoy,hoy).length;
var R=88,C=2*Math.PI*R,frac=Math.min(1,nT/actual.meta),fracE=Math.min(1,esperado/actual.meta);
$('anillo').innerHTML='<svg viewBox="0 0 220 220" role="img" aria-label="'+nT+' de '+actual.meta+' reseñas"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#FFB800"/><stop offset="1" stop-color="#FFD60A"/></linearGradient></defs>'+
 '<circle cx="110" cy="110" r="'+R+'" fill="none" stroke="#1A1A28" stroke-width="18"/>'+
 '<circle id="arco" cx="110" cy="110" r="'+R+'" fill="none" stroke="url(#g)" stroke-width="18" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+C*(1-frac)+'" style="--c:'+C+';animation:arco 1.3s cubic-bezier(.2,.8,.2,1) both"/>'+
 '<line x1="'+(110+R-14)+'" y1="110" x2="'+(110+R+14)+'" y2="110" stroke="#00E5FF" stroke-width="3" stroke-linecap="round" transform="rotate('+(fracE*360)+' 110 110)"/></svg>'+
 '<div class="centro"><div class="grande num" id="nGrande">0</div><div class="de">de '+actual.meta+' reseñas</div><div><span class="mes">'+esc(actual.nombre)+'</span></div></div>';
contar($('nGrande'),nT);
$('heroKicker').textContent='Objetivo de '+actual.nombre.toLowerCase()+' · '+fm(actual.desde)+' al '+fm(actual.hasta);
if(hoy<actual.desde)$('heroEstado').innerHTML='<span class="estado neutro">⏳ Empieza el '+fm(actual.desde)+'</span>';
else if(hoy>actual.hasta)$('heroEstado').innerHTML=nT>=actual.meta?'<span class="estado ok">✔ ¡Meta cumplida!</span>':'<span class="estado mal">✖ No llegamos a la meta</span>';
else if(nT>=actual.meta)$('heroEstado').innerHTML='<span class="estado ok">🎉 ¡Meta cumplida!</span>';
else $('heroEstado').innerHTML=dif>=0?'<span class="estado ok">▲ Vamos '+dif+' arriba del ritmo</span>':'<span class="estado mal">▼ Vamos '+(-dif)+' abajo del ritmo</span>';
$('heroSub').innerHTML='Al día de hoy deberíamos llevar <b>'+esperado+'</b>. '+(faltan?'Faltan <b>'+faltan+'</b> en <b>'+quedan+' días</b>.':'¡Ya llegamos!');
var porDia=quedan?coma((faltan/quedan).toFixed(1)):'0';
$('heroTiles').innerHTML=[[faltan,'faltan'],[quedan,'días que quedan'],[porDia,'por día para llegar'],[hoyN+ayer,'entraron hoy y ayer']].map(function(x){return '<div class="tile"><span class="num"'+(typeof x[0]==='number'?' data-n="'+x[0]+'"':'')+'>'+x[0]+'</span><span>'+x[1]+'</span></div>'}).join('');
[].forEach.call(document.querySelectorAll('[data-n]'),function(el){contar(el,+el.dataset.n)});

// --- camino a las 250
$('objGral').textContent=D.objetivo;
var tot=validas.length,diasTot=entre(D.inicio,fin)+1,pasTot=Math.max(0,Math.min(diasTot,entre(D.inicio,hoy)+1));
var espTot=Math.round(D.objetivo*pasTot/diasTot),acum=0,hitos='';
D.tramos.forEach(function(t){acum+=t.meta;var x=100*acum/D.objetivo;var hecho=tot>=acum;
 var ult=acum===D.objetivo;hitos+='<div class="hito'+(ult?' ult':'')+'" style="left:'+x+'%"><span>'+esc(t.nombre)+'<i class="fecha"> · '+fm(t.hasta)+'</i></span><em style="color:'+(hecho?'var(--ok)':'var(--text)')+'">'+(hecho?'✔ ':'')+acum+'</em></div>'});
var px=Math.min(100,100*tot/D.objetivo),pe=Math.min(100,100*espTot/D.objetivo);
$('pista').innerHTML='<div class="base"><div class="lleno" style="width:'+px+'%"></div></div>'+hitos+
 '<div class="ritmo" style="left:'+pe+'%"><b>hoy: '+espTot+'</b></div><div class="corredor" style="left:'+px+'%" title="'+tot+' reseñas">🏃</div>';
$('tramos').innerHTML=D.tramos.map(function(t){var n=en(validas,t.desde,t.hasta).length;var est;
 if(hoy<t.desde)est='<span class="chip">Empieza el '+fm(t.desde)+'</span>';
 else if(hoy>t.hasta)est=n>=t.meta?'<span class="chip ok">✔ Cumplida</span>':'<span class="chip mal">No cumplida</span>';
 else est=n>=t.meta?'<span class="chip ok">✔ Cumplida</span>':'<span class="chip">En juego</span>';
 return '<div class="tramo'+(t===actual?' actual':'')+'"><div class="fila"><b>'+esc(t.nombre)+'</b>'+est+'</div><div class="fila"><span><span class="num">'+n+'</span> <small>/ '+t.meta+'</small></span><small>'+Math.min(100,Math.round(100*n/t.meta))+'%</small></div><div class="mini"><i style="width:'+Math.min(100,100*n/t.meta)+'%"></i></div><small>'+fm(t.desde)+' al '+fm(t.hasta)+'</small></div>'}).join('');

// --- pestañas
var periodos=[{id:'todo',nombre:'Toda la Copa',desde:D.inicio,hasta:fin}].concat(D.tramos.map(function(t){return{id:t.desde,nombre:t.nombre,desde:t.desde,hasta:t.hasta}}));
var sel=periodos.filter(function(p){return p.id!=='todo'&&p.desde===actual.desde&&p.desde<=hoy})[0]||periodos[0];
function pintarTabs(){$('tabs').innerHTML=periodos.map(function(p,i){return '<button role="tab" data-i="'+i+'" aria-selected="'+(p===sel)+'"'+(p.desde>hoy?' disabled':'')+'>'+esc(p.nombre)+'</button>'}).join('')}
$('tabs').addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.disabled)return;sel=periodos[+b.dataset.i];pintarTabs();pintar()});

function ranking(lista,clave){var m={};lista.forEach(function(r){r[clave].forEach(function(k){m[k]=(m[k]||0)+1})});return m}
function nombreArea(id){var a=D.areas.filter(function(x){return x.id===id})[0];return a?a.icono+' '+a.nombre:id}
function podio(el,filas,etq){var orden=[1,0,2];el.innerHTML=orden.map(function(i){var f=filas[i];var cls='escalon p'+(i+1)+(f?'':' vacio');
 return '<div class="'+cls+'"><div class="quien">'+(f?etq(f[0]):'—')+'</div><div class="bloque">'+(f?f[1]+'<small>'+(f[1]===1?'mención':'menciones')+'</small>':(i+1)+'°')+'</div></div>'}).join('')}
function tabla(el,filas,etq,total,vacio){if(!filas.length){el.innerHTML='<tr><td class="vacio">'+vacio+'</td></tr>';return}
 var max=filas[0][1];var med=['🥇','🥈','🥉'];var pos=0,prev=null;
 el.innerHTML='<tr><th class="p">#</th><th>Nombre</th><th class="barra"></th><th class="m">Menc.</th></tr>'+filas.map(function(f,i){if(f[1]!==prev){pos=i+1;prev=f[1]}
  return '<tr class="'+(pos===1&&f[1]>0?'lider':'')+'" title="'+f[1]+' de '+total+' reseñas que cuentan"><td class="p">'+(f[1]>0&&pos<=3?med[pos-1]:pos)+'</td><td>'+etq(f[0])+'</td><td class="barra"><div><i style="width:'+(max?100*f[1]/max:0)+'%"></i></div></td><td class="m">'+f[1]+'</td></tr>'}).join('');}

function grafico(lista,p){var dias=[];for(var d=p.desde;d<=p.hasta;d=sumar(d,1))dias.push(d);
 var meta=p.id==='todo'?D.objetivo:p.meta||D.tramos.filter(function(t){return t.desde===p.desde})[0].meta;
 var ritmo=meta/(entre(p.desde,p.hasta)+1);$('leyRitmo').textContent='Ritmo para llegar a la meta: '+coma(ritmo.toFixed(1))+' por día';
 var cuenta={},resto={};lista.forEach(function(r){if(r.k==='si')cuenta[r.d]=(cuenta[r.d]||0)+1;else resto[r.d]=(resto[r.d]||0)+1});
 var W=720,H=230,ml=28,mr=8,mt=14,mb=28,iw=W-ml-mr,ih=H-mt-mb;
 var max=Math.max(4,Math.ceil(ritmo*1.3));dias.forEach(function(d){max=Math.max(max,cuenta[d]||0)});
 var paso=max<=6?1:max<=12?2:5;max=Math.ceil(max/paso)*paso;
 var bw=iw/Math.max(dias.length,1),y=function(v){return mt+ih-ih*v/max};
 var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Reseñas que cuentan por día">';
 for(var v=0;v<=max;v+=paso)s+='<line x1="'+ml+'" x2="'+(W-mr)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#262636" stroke-width="1"/><text x="'+(ml-6)+'" y="'+(y(v)+4)+'" fill="#6F6F75" font-size="11" text-anchor="end">'+v+'</text>';
 var cada=Math.ceil(dias.length/10),iHoy=dias.indexOf(hoy);
 if(iHoy>=0)s+='<rect x="'+(ml+iHoy*bw)+'" y="'+mt+'" width="'+bw+'" height="'+ih+'" fill="rgba(255,214,10,.06)"/><text x="'+(ml+iHoy*bw+bw/2)+'" y="'+(mt+10)+'" fill="#FFD60A" font-size="10" text-anchor="middle">hoy</text>';
 dias.forEach(function(d,i){var n=cuenta[d]||0,x=ml+i*bw,w=Math.max(2,bw-4);
  if(d>hoy)s+='<rect x="'+(x+2)+'" y="'+(mt+ih-3)+'" width="'+w+'" height="3" rx="1.5" fill="#262636"/>';
  else if(n)s+='<rect x="'+(x+2)+'" y="'+y(n)+'" width="'+w+'" height="'+(ih*n/max)+'" rx="'+Math.min(4,w/2)+'" fill="'+(d===hoy?'#FFE45C':'#FFD60A')+'"/>';
  if(i%cada===0||i===dias.length-1)s+='<text x="'+(x+bw/2)+'" y="'+(H-8)+'" fill="#6F6F75" font-size="11" text-anchor="middle">'+fm(d)+'</text>';
  s+='<rect class="hit" data-d="'+d+'" x="'+x+'" y="'+mt+'" width="'+bw+'" height="'+ih+'" fill="transparent"/>'});
 s+='<line x1="'+ml+'" x2="'+(W-mr)+'" y1="'+y(ritmo)+'" y2="'+y(ritmo)+'" stroke="#00E5FF" stroke-width="2" stroke-dasharray="6 5"/>';
 s+='<line x1="'+ml+'" x2="'+(W-mr)+'" y1="'+y(0)+'" y2="'+y(0)+'" stroke="#6F6F75" stroke-width="1"/></svg>';
 var g=$('grafico');g.querySelector('svg')&&g.querySelector('svg').remove();g.insertAdjacentHTML('afterbegin',s);
 var tip=$('tip');function mostrar(e){var t=e.target.closest('.hit');if(!t){tip.style.opacity=0;return}var d=t.dataset.d,f=dt(d);
  tip.innerHTML=DIAS[f.getUTCDay()]+' '+fm(d)+(d>hoy?' · todavía no llegó':' · <b>'+(cuenta[d]||0)+'</b> cuentan'+(resto[d]?' · '+resto[d]+' no cuentan':''));
  var r=g.getBoundingClientRect(),b=t.getBoundingClientRect();tip.style.left=Math.max(70,Math.min(r.width-70,b.left-r.left+b.width/2))+'px';tip.style.top=(b.top-r.top+20)+'px';tip.style.opacity=1}
 g.onmousemove=mostrar;g.onclick=mostrar;g.onmouseleave=function(){tip.style.opacity=0}}

var filtro='todas',visibles=12;
function pintarLista(lista){var fl=lista.filter(function(r){return filtro==='todas'||(filtro==='si'?r.k==='si':r.k!=='si')});
 var nNo=lista.filter(function(r){return r.k!=='si'}).length;
 $('filtros').innerHTML=[['todas','Todas ('+lista.length+')'],['si','✅ Cuentan ('+(lista.length-nNo)+')'],['no','🚫 No cuentan ('+nNo+')']].map(function(b){return '<button data-f="'+b[0]+'" aria-pressed="'+(filtro===b[0])+'">'+b[1]+'</button>'}).join('');
 if(!fl.length){$('lista').innerHTML='<p class="vacio">Todavía no hay reseñas acá.</p>';return}
 $('lista').innerHTML=fl.slice(0,visibles).map(function(r){var f=dt(r.d);
  var est='<span class="est">'+'★★★★★'.slice(0,r.s)+'<span class="off">'+'★★★★★'.slice(r.s)+'</span></span>';
  var chip=r.k==='si'?'<span class="chip ok">Cuenta</span>':r.k==='baja'?'<span class="chip mal">No cuenta · menos de 4★</span>':r.k==='editada'?'<span class="chip">No cuenta · reseña vieja editada</span>':'<span class="chip">No cuenta · sin texto</span>';
  var tags=r.ar.map(function(x){return '<span class="tag">'+esc(nombreArea(x))+'</span>'}).concat(r.c.map(function(c){return '<span class="tag col">👤 '+esc(c)+'</span>'})).join('');
  return '<div class="res"><div class="av">'+esc(r.n.charAt(0).toUpperCase())+'</div><div><div class="cab"><span class="n">'+esc(r.n)+'</span>'+est+'<span class="f">'+DIAS[f.getUTCDay()]+' '+fm(r.d)+'</span>'+chip+'</div>'+
   (r.t?'<p>'+esc(r.t)+'</p>':'<p class="sin">(sin texto)</p>')+(tags?'<div class="tags">'+tags+'</div>':'')+'</div></div>'}).join('')+
  (fl.length>visibles?'<button class="mas" id="mas">Ver más ('+(fl.length-visibles)+')</button>':'')}
$('filtros').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;filtro=b.dataset.f;visibles=12;pintar()});
$('lista').addEventListener('click',function(e){if(e.target.id==='mas'){visibles+=20;pintar()}});

function pintar(){var lista=en(D.resenas,sel.desde,sel.hasta),val=lista.filter(function(r){return r.k==='si'});
 var ra=ranking(val,'ar'),filasA=D.areas.map(function(a){return[a.id,ra[a.id]||0]}).sort(function(x,y){return y[1]-x[1]});
 podio($('podioAreas'),filasA.filter(function(f){return f[1]>0}),function(id){var a=D.areas.filter(function(x){return x.id===id})[0];return '<div class="ico">'+a.icono+'</div>'+esc(a.nombre)});
 tabla($('tablaAreas'),filasA,function(id){return esc(nombreArea(id))},val.length,'');
 var rc=ranking(val,'c'),filasC=Object.keys(rc).map(function(k){return[k,rc[k]]}).sort(function(x,y){return y[1]-x[1]||x[0].localeCompare(y[0])});
 podio($('podioColab'),filasC,function(n){return '<div class="ico">👤</div>'+esc(n)});
 tabla($('tablaColab'),filasC,function(n){return esc(n)},val.length,'Todavía nadie fue nombrado en este período. ¡Que el cliente cuente quién lo atendió!');
 grafico(lista,sel);
 var nS=val.length,nT2=lista.filter(function(r){return r.k==='sintexto'}).length,nB=lista.filter(function(r){return r.k==='baja'}).length,nE=lista.filter(function(r){return r.k==='editada'}).length,tt=Math.max(1,lista.length);
 $('segs').innerHTML='<i style="flex:'+nS+';background:var(--ok)" title="Cuentan: '+nS+'"></i><i style="flex:'+nT2+';background:#6F6F75" title="Sin texto: '+nT2+'"></i><i style="flex:'+nB+';background:var(--bad)" title="1 a 3★: '+nB+'"></i><i style="flex:'+nE+';background:var(--plata)" title="Viejas editadas: '+nE+'"></i>';
 $('cuentan').innerHTML=[[nS,'✅ Cuentan','var(--ok)'],[nT2,'💬 Sin texto','var(--muted)'],[nB,'⚠️ De 1 a 3★','var(--bad)']].concat(nE?[[nE,'🕓 Viejas editadas','var(--plata)']]:[]).map(function(x){return '<div class="tile"><span class="num" style="color:'+x[2]+'">'+x[0]+'</span><span>'+x[1]+' · '+Math.round(100*x[0]/tt)+'%</span></div>'}).join('');
 pintarLista(lista)}
pintarTabs();pintar();
})();
</script>
</body></html>`;
}
