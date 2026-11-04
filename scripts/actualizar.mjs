// Copa de Reseñas ALE: trae las reseñas de Google Maps (Apify), las analiza,
// guarda el historial en data/resenas.json y arma docs/index.html.
import fs from 'node:fs/promises';

const CFG = JSON.parse(await fs.readFile('config.json', 'utf8'));
const STORE_PATH = 'data/resenas.json';
const HTML_PATH = 'docs/index.html';
const OFFSET_HS = -3; // hora de Argentina
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- fechas ----------
const enArg = (d) => new Date(new Date(d).getTime() + OFFSET_HS * 3600e3);
const diaArg = (d) => enArg(d).toISOString().slice(0, 10);
const hoy = diaArg(new Date());
const sumarDias = (dia, n) => new Date(Date.parse(dia + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400e3);
const fmtDia = (dia) => dia.slice(8, 10) + '/' + dia.slice(5, 7);

// ---------- historial ----------
async function leerStore() {
  try {
    return JSON.parse(await fs.readFile(STORE_PATH, 'utf8'));
  } catch {
    return { resenas: {}, ficha: null, ultima_ok: null, ultima_completa: null };
  }
}

async function conReintentos(fn, nombre, intentos = 3) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      console.error(`[${nombre}] intento ${i} de ${intentos} falló: ${e.message}`);
      if (i < intentos) await sleep(30000 * i);
    }
  }
  throw ultimo;
}

// ---------- Apify ----------
async function apifyJSON(url, opciones = {}) {
  const res = await fetch(url, {
    ...opciones,
    headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function traerResenas(desde, maximo) {
  if (process.env.MOCK_ITEMS) return JSON.parse(await fs.readFile(process.env.MOCK_ITEMS, 'utf8'));
  if (!process.env.APIFY_TOKEN) throw new Error('Falta la clave APIFY_TOKEN en los secretos del repositorio');
  const input = {
    startUrls: [{ url: CFG.google_maps_url }],
    maxReviews: maximo,
    reviewsSort: 'newest',
    reviewsStartDate: desde,
    language: 'es',
    personalData: true,
  };
  const { data: run } = await apifyJSON(`https://api.apify.com/v2/acts/${CFG.apify_actor}/runs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  console.log(`Apify: corrida ${run.id} iniciada (desde ${desde}, máx. ${maximo})`);
  const limite = Date.now() + 15 * 60e3;
  let estado = run.status;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(estado)) {
    if (Date.now() > limite) throw new Error('Apify tardó más de 15 minutos');
    await sleep(10000);
    estado = (await apifyJSON(`https://api.apify.com/v2/actor-runs/${run.id}`)).data.status;
  }
  if (estado !== 'SUCCEEDED') throw new Error(`La corrida de Apify terminó en ${estado}`);
  return apifyJSON(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&format=json`);
}

function normalizar(it) {
  const fecha = it.publishedAtDate || it.publishAt || it.date;
  return {
    id: it.reviewId || it.id,
    autor: (it.name || it.reviewerName || '').trim(),
    estrellas: Number(it.stars ?? it.rating ?? 0),
    texto: (it.text || '').trim(),
    fecha,
    dia: fecha ? diaArg(fecha) : null,
    url: it.reviewUrl || '',
    respondida: Boolean(it.responseFromOwnerText),
  };
}

// ---------- análisis ----------
const sinTildes = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const contiene = (texto, palabra) => new RegExp(`(^|[^a-zñ])${sinTildes(palabra)}([^a-zñ]|$)`).test(texto);

function porPalabras(texto) {
  const t = sinTildes(texto);
  const areas = CFG.areas.filter((a) => a.palabras.some((p) => contiene(t, p))).map((a) => a.id);
  const colaboradores = CFG.colaboradores
    .filter((c) => [c.nombre, ...(c.alias || [])].some((n) => contiene(t, n)))
    .map((c) => c.nombre);
  return { areas, colaboradores };
}

async function porIA(lote) {
  const conocidos = CFG.colaboradores.length
    ? CFG.colaboradores.map((c) => `- ${c.nombre}${c.alias?.length ? ` (también: ${c.alias.join(', ')})` : ''}, área ${c.area}`).join('\n')
    : '(todavía no hay lista)';
  const sistema = `Analizás reseñas de Google de ${CFG.negocio} (Realicó, La Pampa), un comercio multirubro.
Para cada reseña devolvé:
- "areas": las áreas del negocio que nombra o de las que habla (solo estos id):
${CFG.areas.map((a) => `  ${a.id}: ${a.descripcion}`).join('\n')}
- "colaboradores": los nombres de empleados de ${CFG.negocio} que la reseña nombra. No incluyas al autor, ni marcas, ni nombres del negocio. Colaboradores conocidos:
${conocidos}
Si nombra a uno conocido, usá su nombre tal como figura arriba. Si nombra a otro empleado, devolvé su nombre de pila con mayúscula inicial.
Respondé SOLO con JSON: {"resultados":[{"id":"...","areas":["..."],"colaboradores":["..."]}]}`;
  const res = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      model: CFG.modelo_ia,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: JSON.stringify(lote.map((r) => ({ id: r.id, texto: r.texto }))) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`IA ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const contenido = (await res.json()).choices[0].message.content;
  const { resultados } = JSON.parse(contenido.replace(/^```(json)?|```$/g, ''));
  return new Map(resultados.map((r) => [r.id, r]));
}

async function clasificar(resenas) {
  const conTexto = resenas.filter((r) => r.texto);
  for (const r of resenas.filter((r) => !r.texto)) Object.assign(r, { areas: [], colaboradores: [], clasificada: 'sin texto' });
  const idsAreas = new Set(CFG.areas.map((a) => a.id));
  for (let i = 0; i < conTexto.length; i += 15) {
    const lote = conTexto.slice(i, i + 15);
    let ia = null;
    if (process.env.GITHUB_TOKEN) {
      try {
        ia = await conReintentos(() => porIA(lote), 'IA', 2);
      } catch (e) {
        console.error(`IA no disponible, uso palabras clave: ${e.message}`);
      }
    }
    for (const r of lote) {
      const res = ia?.get(r.id);
      const base = res
        ? { areas: (res.areas || []).filter((a) => idsAreas.has(a)), colaboradores: res.colaboradores || [], clasificada: 'ia' }
        : { ...porPalabras(r.texto), clasificada: 'palabras' };
      // Un colaborador conocido suma también para su área
      for (const c of CFG.colaboradores) {
        if (base.colaboradores.includes(c.nombre) && c.area && !base.areas.includes(c.area)) base.areas.push(c.area);
      }
      base.colaboradores = [...new Set(base.colaboradores.map((n) => n.trim()).filter(Boolean))];
      Object.assign(r, base);
    }
  }
}

const cuenta = (r) => !r.eliminada && r.estrellas >= CFG.regla.estrellas_minimas && r.texto.length >= CFG.regla.caracteres_minimos;

// ---------- corrida ----------
async function main() {
  const store = await leerStore();
  const manual = process.env.EVENTO === 'workflow_dispatch';
  if (!manual && store.ultima_ok && diaArg(store.ultima_ok) === hoy && !process.env.MOCK_ITEMS) {
    console.log('Ya se actualizó hoy: no hago nada.');
    return;
  }
  const hayHistorial = Object.keys(store.resenas).length > 0;
  const completa = process.env.COMPLETA === 'true' || !store.ultima_completa || diasEntre(diaArg(store.ultima_completa), hoy) >= 7;
  const desde = completa ? CFG.inicio : [sumarDias(hoy, -10), CFG.inicio].sort().pop();
  const maximo = completa ? 1000 : 200;

  const crudos = await conReintentos(() => traerResenas(desde, maximo), 'Apify');
  if (!Array.isArray(crudos)) throw new Error('Apify no devolvió una lista');
  const conId = crudos.filter((it) => it.reviewId || it.id);
  const primero = crudos[0];
  if (primero?.title && !sinTildes(primero.title).includes(CFG.control_nombre)) {
    throw new Error(`La ficha que leyó Apify no es la de ${CFG.negocio}: «${primero.title}»`);
  }
  if (completa && hayHistorial && conId.length === 0) throw new Error('Apify no trajo reseñas en la lectura completa: no toco nada');

  if (primero && (primero.totalScore || primero.reviewsCount)) {
    store.ficha = { puntaje: primero.totalScore ?? null, cantidad: primero.reviewsCount ?? null, al: new Date().toISOString() };
  }

  const traidas = conId.map(normalizar).filter((r) => r.id && r.dia && r.dia >= CFG.inicio);
  const ahora = new Date().toISOString();
  const aClasificar = [];
  for (const r of traidas) {
    const previa = store.resenas[r.id];
    if (!previa) {
      aClasificar.push(r);
      store.resenas[r.id] = { ...r, vista: ahora, eliminada: false };
    } else {
      const cambio = previa.texto !== r.texto;
      Object.assign(previa, { ...r, vista: previa.vista, eliminada: false });
      if (cambio || previa.clasificada === 'palabras') aClasificar.push(previa);
    }
  }
  // Las nuevas se guardan con su análisis
  const pendientes = aClasificar.map((r) => store.resenas[r.id]);
  await clasificar(pendientes);

  // En la lectura completa, lo que Google ya no muestra se marca como eliminado
  if (completa) {
    const ids = new Set(traidas.map((r) => r.id));
    const activas = Object.values(store.resenas).filter((r) => !r.eliminada);
    if (traidas.length >= activas.length * 0.9) {
      for (const r of activas) if (!ids.has(r.id)) Object.assign(r, { eliminada: true, eliminada_al: ahora });
    } else {
      console.warn(`Lectura completa parcial (${traidas.length} de ${activas.length}): no marco eliminadas`);
    }
    store.ultima_completa = ahora;
  }

  store.ultima_ok = ahora;
  console.log(`Listo: ${traidas.length} leídas, ${aClasificar.length} analizadas, ${Object.values(store.resenas).filter(cuenta).length} cuentan`);
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 1));
  await fs.writeFile(HTML_PATH, armarHTML(store));
}

// ---------- página ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nombreArea = (id) => CFG.areas.find((a) => a.id === id)?.nombre || id;
const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
const estrellas = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const pila = (autor) => esc(autor.split(' ')[0] || 'Cliente');

function ranking(lista, clave) {
  const m = new Map();
  for (const r of lista) for (const k of r[clave] || []) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function tablaRanking(filas, etiqueta, vacio) {
  if (!filas.length) return `<p class="vacio">${vacio}</p>`;
  const max = filas[0][1];
  return `<ol class="ranking">${filas
    .map(([k, n], i) => `<li><span class="pos">${i === 0 ? '🏆' : i + 1}</span><span class="nom">${esc(etiqueta(k))}</span><span class="barra"><i style="width:${pct(n, max)}%"></i></span><b>${n}</b></li>`)
    .join('')}</ol>`;
}

function tarjetaResena(r) {
  const chips = [
    ...(r.areas || []).map((a) => `<span class="chip area">${esc(nombreArea(a))}</span>`),
    ...(r.colaboradores || []).map((c) => `<span class="chip colab">👤 ${esc(c)}</span>`),
  ].join('');
  const estado = cuenta(r)
    ? '<span class="sello si">Cuenta</span>'
    : r.estrellas < CFG.regla.estrellas_minimas
      ? '<span class="sello alerta">No cuenta · menos de 4★</span>'
      : '<span class="sello no">No cuenta · sin texto</span>';
  return `<article class="resena"><header><span class="est">${estrellas(r.estrellas)}</span><span class="quien">${pila(r.autor)} · ${fmtDia(r.dia)}</span>${estado}</header>${
    r.texto ? `<p>${esc(r.texto)}</p>` : '<p class="vacio">(sin texto)</p>'
  }${chips ? `<div class="chips">${chips}</div>` : ''}</article>`;
}

function armarHTML(store) {
  const todas = Object.values(store.resenas).filter((r) => !r.eliminada).sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
  const validas = todas.filter(cuenta);
  const sinTexto = todas.filter((r) => !cuenta(r) && r.estrellas >= CFG.regla.estrellas_minimas);
  const bajas = todas.filter((r) => r.estrellas < CFG.regla.estrellas_minimas);
  const fin = CFG.tramos.at(-1).hasta;
  const total = validas.length;
  const faltan = Math.max(0, CFG.objetivo_general - total);
  const diasRestantes = Math.max(0, diasEntre(hoy, fin) + 1);
  const totalDias = diasEntre(CFG.inicio, fin) + 1;
  const transcurridos = Math.min(totalDias, Math.max(0, diasEntre(CFG.inicio, hoy) + 1));
  const esperadoGral = Math.round((CFG.objetivo_general * transcurridos) / totalDias);
  const ritmo = diasRestantes ? (faltan / diasRestantes).toFixed(1).replace('.', ',') : '0';
  const tramoActual = CFG.tramos.find((t) => hoy >= t.desde && hoy <= t.hasta);

  const tramos = CFG.tramos
    .map((t) => {
      const n = validas.filter((r) => r.dia >= t.desde && r.dia <= t.hasta).length;
      const dias = diasEntre(t.desde, t.hasta) + 1;
      let estado;
      if (hoy < t.desde) estado = `<span class="sello no">Empieza el ${fmtDia(t.desde)}</span>`;
      else if (hoy > t.hasta) estado = n >= t.meta ? '<span class="sello si">✔ Meta cumplida</span>' : '<span class="sello alerta">Meta no cumplida</span>';
      else {
        const esperado = Math.round((t.meta * (diasEntre(t.desde, hoy) + 1)) / dias);
        const dif = n - esperado;
        estado = dif >= 0 ? `<span class="sello si">Vamos ${dif} arriba del ritmo</span>` : `<span class="sello alerta">Vamos ${-dif} abajo del ritmo</span>`;
        estado += `<small>Al día de hoy deberíamos llevar ${esperado}. Faltan ${Math.max(0, t.meta - n)} en ${diasEntre(hoy, t.hasta) + 1} días.</small>`;
      }
      return `<div class="tramo${t === tramoActual ? ' actual' : ''}"><h3>${esc(t.nombre)} <small>${fmtDia(t.desde)} al ${fmtDia(t.hasta)}</small></h3><div class="cifra"><b>${n}</b> / ${t.meta}</div><div class="progreso"><i style="width:${pct(n, t.meta)}%"></i></div>${estado}</div>`;
    })
    .join('');

  const hace24 = new Date(Date.now() - 24 * 3600e3).toISOString();
  const recientes = todas.filter((r) => r.fecha >= hace24);
  const enTramo = tramoActual ? validas.filter((r) => r.dia >= tramoActual.desde && r.dia <= tramoActual.hasta) : [];

  const ultimos = [];
  for (let i = 13; i >= 0; i--) {
    const d = sumarDias(hoy, -i);
    if (d < CFG.inicio) continue;
    const delDia = todas.filter((r) => r.dia === d);
    ultimos.push(`<tr><td>${fmtDia(d)}</td><td>${delDia.filter(cuenta).length}</td><td>${delDia.length - delDia.filter(cuenta).length}</td></tr>`);
  }

  const actualizado = store.ultima_ok || new Date().toISOString();
  const ficha = store.ficha;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Copa de Reseñas ALE</title>
<meta name="robots" content="noindex">
<style>
:root{--fondo:#f5f3ee;--papel:#fff;--tinta:#1d1d1b;--suave:#6b6b66;--linea:#e4e1d8;--marca:#c8102e;--ok:#1f8a4c;--mal:#c0392b;--gris:#9a978e}
*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--tinta);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:16px}
.top{background:var(--tinta);color:#fff;border-radius:16px;padding:20px}
.top small{color:#cfcabd;letter-spacing:.08em;text-transform:uppercase;font-size:12px}.top h1{margin:4px 0 6px;font-size:26px}
.top p{margin:0;color:#e9e6dc;font-size:14px}
.aviso{display:none;background:#fdecea;color:var(--mal);border:1px solid #f5c6c0;border-radius:12px;padding:12px;margin-top:12px;font-weight:600}
section{background:var(--papel);border:1px solid var(--linea);border-radius:16px;padding:18px;margin-top:14px}
h2{margin:0 0 12px;font-size:19px}h3{margin:0 0 6px;font-size:16px}h3 small{color:var(--suave);font-weight:400}
.general .cifra{font-size:44px;font-weight:800;line-height:1}.general .cifra span{font-size:20px;color:var(--suave);font-weight:600}
.progreso{height:14px;background:#eeebe3;border-radius:99px;overflow:hidden;margin:10px 0}.progreso i{display:block;height:100%;background:var(--marca);border-radius:99px}
.datos{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}
.datos div{background:#f8f6f1;border-radius:12px;padding:10px}.datos b{display:block;font-size:22px}.datos span{color:var(--suave);font-size:13px}
.tramos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.tramo{border:1px solid var(--linea);border-radius:14px;padding:14px}.tramo.actual{border:2px solid var(--marca)}
.tramo .cifra{font-size:15px;color:var(--suave)}.tramo .cifra b{font-size:30px;color:var(--tinta)}.tramo small{display:block;color:var(--suave);font-size:13px;margin-top:6px}
.sello{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:99px;background:#eeebe3;color:var(--suave)}
.sello.si{background:#e3f4ea;color:var(--ok)}.sello.alerta{background:#fdecea;color:var(--mal)}
.ranking{list-style:none;margin:0;padding:0}.ranking li{display:grid;grid-template-columns:32px minmax(110px,1.6fr) 1fr 36px;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--linea)}
.ranking li:last-child{border:0}.pos{font-weight:700;text-align:center}.barra{height:10px;background:#eeebe3;border-radius:99px;overflow:hidden}.barra i{display:block;height:100%;background:var(--tinta)}
.ranking b{text-align:right}
.dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.dos section{margin-top:0}
.resena{border-top:1px solid var(--linea);padding:12px 0}.resena:first-of-type{border:0}
.resena header{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.est{color:#e8a317;letter-spacing:1px}.quien{color:var(--suave);font-size:14px}
.resena p{margin:6px 0}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:12px;padding:2px 8px;border-radius:99px;background:#f1eee6}.chip.colab{background:#e8eefc}
.vacio{color:var(--gris);font-style:italic}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:6px;border-bottom:1px solid var(--linea);text-align:left}
details summary{cursor:pointer;font-weight:600}
footer{color:var(--suave);font-size:13px;padding:18px 4px}
</style></head><body><main>
<div class="top"><small>ALE Centro de Compras · Programa de reseñas</small><h1>🏆 La Copa de Reseñas</h1>
<p>Actualizado el <b id="act" data-iso="${actualizado}">${fmtDia(diaArg(actualizado))} a las ${enArg(actualizado).toISOString().slice(11, 16)} h</b> · se actualiza solo todos los días a las 11 h${
    ficha?.puntaje ? ` · Google hoy: ★ ${String(ficha.puntaje).replace('.', ',')} con ${ficha.cantidad} reseñas` : ''
  }</p></div>
<div class="aviso" id="aviso">⚠️ Hoy todavía no se actualizó. Los números son de la última actualización.</div>

<section class="general"><h2>Objetivo general · ${fmtDia(CFG.inicio)} al ${fmtDia(fin)}</h2>
<div class="cifra">${total} <span>/ ${CFG.objetivo_general} reseñas</span></div>
<div class="progreso"><i style="width:${pct(total, CFG.objetivo_general)}%"></i></div>
<div class="datos"><div><b>${pct(total, CFG.objetivo_general)}%</b><span>del objetivo</span></div><div><b>${faltan}</b><span>faltan</span></div>
<div><b>${esperadoGral}</b><span>deberíamos llevar hoy</span></div><div><b>${ritmo}</b><span>por día para llegar (${diasRestantes} días)</span></div></div></section>

<section><h2>Objetivo por mes</h2><div class="tramos">${tramos}</div></section>

<section><h2>Nuevas en las últimas 24 horas (${recientes.length})</h2>${recientes.length ? recientes.map(tarjetaResena).join('') : '<p class="vacio">Todavía no entraron reseñas en las últimas 24 horas.</p>'}</section>

<div class="dos" style="margin-top:14px">
<section><h2>🏅 Áreas más nombradas</h2><h3>Toda la temporada</h3>${tablaRanking(ranking(validas, 'areas'), nombreArea, 'Todavía no hay menciones.')}
${tramoActual ? `<h3 style="margin-top:14px">${esc(tramoActual.nombre)}</h3>${tablaRanking(ranking(enTramo, 'areas'), nombreArea, 'Todavía no hay menciones este mes.')}` : ''}</section>
<section><h2>👤 Colaboradores más nombrados</h2><h3>Toda la temporada</h3>${tablaRanking(ranking(validas, 'colaboradores'), (k) => k, 'Todavía nadie fue nombrado.')}
${tramoActual ? `<h3 style="margin-top:14px">${esc(tramoActual.nombre)}</h3>${tablaRanking(ranking(enTramo, 'colaboradores'), (k) => k, 'Todavía nadie fue nombrado este mes.')}` : ''}</section>
</div>

<section><h2>Las que no cuentan</h2>
<div class="datos"><div><b>${sinTexto.length}</b><span>con 4-5★ pero sin texto</span></div><div><b>${bajas.length}</b><span>de 1 a 3★ (alerta)</span></div></div>
<p style="color:var(--suave);font-size:14px">Para que una reseña cuente tiene que tener texto y 4 o 5★. Pedile al cliente que cuente qué compró y quién lo atendió.</p>
${bajas.length ? `<h3>Reseñas de 1 a 3★</h3>${bajas.map(tarjetaResena).join('')}` : ''}
${sinTexto.length ? `<details><summary>Ver las ${sinTexto.length} sin texto</summary>${sinTexto.map(tarjetaResena).join('')}</details>` : ''}</section>

<section><h2>Día por día (últimos 14 días)</h2><table><tr><th>Día</th><th>Cuentan</th><th>No cuentan</th></tr>${ultimos.reverse().join('')}</table></section>

<section><details><summary>Todas las reseñas que cuentan (${validas.length})</summary>${validas.map(tarjetaResena).join('')}</details></section>

<footer>Datos de la ficha de Google Maps de ALE Centro de Compras. Cuentan las reseñas desde el ${fmtDia(CFG.inicio)} con texto y 4 o 5★. Si Google borra una reseña, se descuenta. Las menciones las detecta una inteligencia artificial. Programa de Olpa Group.</footer>
</main>
<script>
(function(){var el=document.getElementById('act');var h=(Date.now()-Date.parse(el.dataset.iso))/36e5;if(h>26)document.getElementById('aviso').style.display='block';})();
</script>
</body></html>`;
}

await main();
