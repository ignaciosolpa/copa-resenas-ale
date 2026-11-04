// Copa de Reseñas ALE: trae las reseñas de Google Maps (Apify), las analiza,
// guarda el historial en data/resenas.json y arma docs/index.html.
import fs from 'node:fs/promises';
import { armarHTML } from './pagina.mjs';

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
// La palabra suelta o en plural («deporte» también encuentra «deportes»)
const contiene = (texto, palabra) => new RegExp(`(^|[^a-zñ])${sinTildes(palabra)}(s|es)?([^a-zñ]|$)`).test(texto);

// Nombres de pila comunes: detectan a colaboradores que todavía no están en config.json
const NOMBRES = `juan pablo pedro jose carlos luis jorge miguel diego martin matias nicolas nico lucas facundo facu franco gonzalo
gonza sebastian seba hernan fernando fer alejandro gustavo marcelo ricardo roberto daniel dani sergio raul oscar ruben hugo mario
javier javi maxi maximiliano emiliano ema ezequiel eze agustin tomas santiago ignacio nacho joaquin rodrigo rodri mauricio mauri
leandro cristian claudio walter ariel dario fabian federico fede gabriel gaston german guillermo guille ivan julian leonardo leo
manuel manu mariano nahuel omar patricio ramiro ramon rafael silvio victor alberto andres antonio eduardo enzo esteban gerardo
horacio lautaro mateo nestor norberto osvaldo pepe quique tito valentin marcos marco adrian alfredo emanuel jonathan kevin
maria ana laura lau sole soledad naty nati natalia carla carolina caro claudia cecilia ceci daniela florencia flor gabriela gabi
georgina gisela jesica jessica julieta juli karina lorena lucia luciana mabel marcela mariana marina micaela mica milagros mili
monica noelia paula pau patricia paty romina rocio sabrina silvia sofia sofi susana valeria vale vanesa veronica vero vicky yanina
agustina agus antonella anto belen camila cami celeste eugenia euge ines ivana jimena josefina magali marta melina nadia pamela
priscila sandra sonia tamara vanina yamila analia betina delfina emilia andrea alejandra estela graciela liliana miriam norma
silvana virginia viviana`.split(/\s+/);
const capital = (n) => n.charAt(0).toUpperCase() + n.slice(1);

function clasificar(resenas) {
  for (const r of resenas) {
    if (!r.texto) {
      Object.assign(r, { areas: [], colaboradores: [], clasificada: 'sin texto' });
      continue;
    }
    const t = sinTildes(r.texto);
    const areas = CFG.areas.filter((a) => a.palabras.some((p) => contiene(t, p))).map((a) => a.id);
    const colaboradores = [];
    const tomados = new Set();
    for (const c of CFG.colaboradores) {
      const formas = [c.nombre, ...(c.alias || [])].map(sinTildes);
      if (formas.some((n) => contiene(t, n))) {
        colaboradores.push(c.nombre);
        formas.forEach((n) => tomados.add(n));
        // Un colaborador suma también para su área
        if (c.area && !areas.includes(c.area)) areas.push(c.area);
      }
    }
    for (const n of NOMBRES) {
      if (!tomados.has(n) && new RegExp(`(^|[^a-zñ])${n}([^a-zñ]|$)`).test(t)) colaboradores.push(capital(n));
    }
    Object.assign(r, { areas, colaboradores: [...new Set(colaboradores)], clasificada: 'palabras' });
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
  let nuevas = 0;
  for (const r of traidas) {
    const previa = store.resenas[r.id];
    if (!previa) {
      nuevas++;
      store.resenas[r.id] = { ...r, vista: ahora, eliminada: false };
    } else {
      Object.assign(previa, { ...r, vista: previa.vista, eliminada: false });
    }
  }
  // Se analizan todas en cada corrida: así se aplica cualquier cambio de config.json
  clasificar(Object.values(store.resenas));

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
  await fs.mkdir('data', { recursive: true });
  await fs.mkdir('docs', { recursive: true });
  console.log(`Listo: ${traidas.length} leídas, ${nuevas} nuevas, ${Object.values(store.resenas).filter(cuenta).length} cuentan`);
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 1));
  await fs.writeFile(HTML_PATH, await armarHTML(store, { CFG, hoy, cuenta }));
}

await main();
