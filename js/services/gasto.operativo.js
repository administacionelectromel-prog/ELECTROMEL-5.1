/* ════════════════════════════════════════════════════════════════
   GASTO OPERATIVO POR VIAJE — v6.8
   ════════════════════════════════════════════════════════════════
   Modelo: el gasto de un viaje (alojamiento, comida, combustible,
   movilidad, pasaje) es GLOBAL del viaje, NO por trabajo. Si en un
   viaje se hacen 2 trabajos, el gasto se divide entre 2; si son 5,
   entre 5.

   Dos entidades:
   - Ciudad operativa: configuración de gastos de un destino
     (km desde SMA, transporte, alojamiento/día, comida/día,
      pasaje fijo, movilidad local, margen mínimo %).
   - Viaje operativo: una salida concreta (ciudad + fecha salida +
     fecha regreso). El sistema calcula días y gasto total solo.

   El combustible se calcula con el precio de nafta global (una vez)
   × km ida y vuelta ÷ rendimiento.
   ──────────────────────────────────────────────────────────────── */

import { dbGet, dbPut, dbDelete, dbGetAll, getCfg, setCfg } from '../core/db.js';
import { store } from '../core/store.js';
import { numSeguro, fechaHoy } from '../core/utils.js';

const _db = () => store.get('db');

/* ── COMBUSTIBLE GLOBAL ──────────────────────────────────────────
   Precio nafta/L y rendimiento km/L se guardan una sola vez y
   aplican a todos los viajes en auto. */

export async function getCombustibleGlobal() {
  const db = _db();
  let precio = 1200, rendimiento = 12;
  try {
    const p = await getCfg(db, 'nafta_precio_litro');
    const r = await getCfg(db, 'nafta_rendimiento_km');
    if (p != null && p !== '') precio = numSeguro(p, 1200);
    if (r != null && r !== '') rendimiento = numSeguro(r, 12);
  } catch (e) { /* usar defaults */ }
  return { precio, rendimiento };
}

export async function setCombustibleGlobal(precio, rendimiento) {
  const db = _db();
  await setCfg(db, 'nafta_precio_litro', numSeguro(precio, 1200));
  await setCfg(db, 'nafta_rendimiento_km', numSeguro(rendimiento, 12));
}

/* Costo de combustible para una cantidad de km (ida y vuelta ya incluida) */
export function calcularCombustible(km, precioLitro, rendimientoKmL) {
  const k = numSeguro(km, 0);
  const p = numSeguro(precioLitro, 1200);
  const r = numSeguro(rendimientoKmL, 12);
  if (r <= 0) return 0;
  return Math.round((k / r) * p);
}

/* ── CIUDADES OPERATIVAS (CRUD) ──────────────────────────────────── */

export async function listarCiudades() {
  const db = _db();
  if (!db) return [];
  try {
    const arr = await dbGetAll(db, 'ciudades_op', false);
    return (arr || []).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  } catch (e) { return []; }
}

export async function getCiudad(id) {
  const db = _db();
  try { return await dbGet(db, 'ciudades_op', id); }
  catch (e) { return null; }
}

export async function guardarCiudad(ciudad) {
  const db = _db();
  const data = {
    nombre:          (ciudad.nombre || '').trim(),
    codigo:          (ciudad.codigo || '').trim().toUpperCase(),
    km:              numSeguro(ciudad.km, 0),               // km SOLO IDA desde SMA
    transporte:      ciudad.transporte || 'auto',          // 'auto' | 'colectivo'
    alojamiento_dia: numSeguro(ciudad.alojamiento_dia, 0),  // por día
    comida_dia:      numSeguro(ciudad.comida_dia, 0),       // por día
    pasaje:          numSeguro(ciudad.pasaje, 0),           // fijo (colectivo)
    movilidad_local: numSeguro(ciudad.movilidad_local, 0),  // fijo
    margen_minimo:   numSeguro(ciudad.margen_minimo, 30),   // % de rentabilidad mínima
    actualizado_at:  new Date().toISOString()
  };
  if (ciudad.id) data.id = ciudad.id;
  if (!data.nombre) throw new Error('La ciudad necesita un nombre');
  return await dbPut(db, 'ciudades_op', data);
}

export async function eliminarCiudad(id) {
  const db = _db();
  return await dbDelete(db, 'ciudades_op', id);
}

/* Costo por día de una ciudad (alojamiento + comida) */
export function costoPorDiaCiudad(ciudad) {
  if (!ciudad) return 0;
  return numSeguro(ciudad.alojamiento_dia, 0) + numSeguro(ciudad.comida_dia, 0);
}

/* Costo fijo de una ciudad (pasaje + movilidad + combustible ida/vuelta) */
export async function costoFijoCiudad(ciudad) {
  if (!ciudad) return { pasaje: 0, movilidad: 0, combustible: 0, total: 0 };
  const movilidad = numSeguro(ciudad.movilidad_local, 0);
  const esAuto = (ciudad.transporte || 'auto') === 'auto';

  let combustible = 0, pasaje = 0;
  if (esAuto) {
    /* En auto: combustible ida y vuelta, SIN pasaje */
    const { precio, rendimiento } = await getCombustibleGlobal();
    combustible = calcularCombustible(numSeguro(ciudad.km, 0) * 2, precio, rendimiento);
  } else {
    /* En colectivo: pasaje (ida y vuelta), SIN combustible.
       Si el usuario cargó el pasaje de un tramo, se cuenta ida y vuelta. */
    pasaje = numSeguro(ciudad.pasaje, 0) * 2;
  }
  return { pasaje, movilidad, combustible, total: pasaje + movilidad + combustible };
}

/* ── VIAJES OPERATIVOS ───────────────────────────────────────────── */

export async function listarViajes() {
  const db = _db();
  if (!db) return [];
  try {
    const arr = await dbGetAll(db, 'viajes_operativos', false);
    return (arr || []).sort((a, b) => (b.fecha_salida || '').localeCompare(a.fecha_salida || ''));
  } catch (e) { return []; }
}

export async function getViaje(id) {
  const db = _db();
  try { return await dbGet(db, 'viajes_operativos', id); }
  catch (e) { return null; }
}

/* Estado de un viaje según la fecha de hoy:
   - 'futuro': todavía no empezó
   - 'activo': hoy cae entre salida y regreso (estás de viaje)
   - 'por_cerrar': terminó hace MENOS de 48hs (ventana de corrección)
   - 'archivado': terminó hace MÁS de 48hs (va al historial) */
export function estadoViaje(viaje) {
  if (!viaje || !viaje.fecha_salida || !viaje.fecha_regreso) return 'activo';
  const ahora = new Date();
  const salida = new Date(viaje.fecha_salida.slice(0, 10) + 'T00:00:00');
  const regreso = new Date(viaje.fecha_regreso.slice(0, 10) + 'T23:59:59');
  if (ahora < salida) return 'futuro';
  if (ahora <= regreso) return 'activo';
  /* Ya terminó: ¿pasaron 48hs? */
  const horasDesdeRegreso = (ahora - regreso) / 3600000;
  return horasDesdeRegreso > 48 ? 'archivado' : 'por_cerrar';
}

/* Viajes vigentes (futuro, activo, por_cerrar) → se muestran en Agenda */
export async function listarViajesVigentes() {
  const todos = await listarViajes();
  return todos.filter(v => estadoViaje(v) !== 'archivado');
}

/* Viajes archivados (terminados hace +48hs) → historial en Admin */
export async function listarViajesArchivados() {
  const todos = await listarViajes();
  return todos.filter(v => estadoViaje(v) === 'archivado')
    .sort((a, b) => (b.fecha_regreso || '').localeCompare(a.fecha_regreso || ''));
}

/* Historial agrupado por ciudad con totales y promedios reales.
   Sirve para ver cuánto rinde cada ciudad y mejorar estimaciones. */
export async function historialPorCiudad() {
  const archivados = await listarViajesArchivados();
  const porCiudad = {};

  for (const v of archivados) {
    const a = await analizarViaje(v);
    const nombre = a.gasto.ciudad_nombre || v.ciudad || '—';
    const key = nombre.toLowerCase().trim();
    if (!porCiudad[key]) {
      porCiudad[key] = {
        ciudad: nombre, nViajes: 0,
        totalFacturado: 0, totalCobrado: 0, totalGasto: 0, totalNeto: 0,
        sumaDias: 0,
        sumaAlojDia: 0, sumaComidaDia: 0, sumaCombustible: 0, sumaPasaje: 0, sumaMovilidad: 0,
        nConAloj: 0, nConComida: 0, nConCombustible: 0, nConPasaje: 0, nConMovilidad: 0,
        viajes: []
      };
    }
    const g = porCiudad[key];
    g.nViajes++;
    g.totalFacturado += a.facturado;
    g.totalCobrado += a.cobrado;
    g.totalGasto += a.gasto.total;
    g.totalNeto += a.netoProyectado;
    g.sumaDias += a.gasto.dias;
    /* Promedios por día (alojamiento, comida) y por viaje (resto) */
    if (a.gasto.dias > 0) {
      g.sumaAlojDia += a.gasto.alojamiento / a.gasto.dias; g.nConAloj++;
      g.sumaComidaDia += a.gasto.comida / a.gasto.dias; g.nConComida++;
    }
    if (a.gasto.combustible) { g.sumaCombustible += a.gasto.combustible; g.nConCombustible++; }
    if (a.gasto.pasaje) { g.sumaPasaje += a.gasto.pasaje; g.nConPasaje++; }
    if (a.gasto.movilidad) { g.sumaMovilidad += a.gasto.movilidad; g.nConMovilidad++; }
    g.viajes.push({ id: v.id, fecha_salida: v.fecha_salida, fecha_regreso: v.fecha_regreso, dias: a.gasto.dias, facturado: a.facturado, gasto: a.gasto.total, neto: a.netoProyectado, semaforo: a.semaforo });
  }

  /* Calcular promedios finales */
  const resultado = Object.values(porCiudad).map(g => ({
    ciudad: g.ciudad,
    nViajes: g.nViajes,
    totalFacturado: g.totalFacturado,
    totalCobrado: g.totalCobrado,
    totalGasto: g.totalGasto,
    totalNeto: g.totalNeto,
    promDias: g.nViajes ? Math.round(g.sumaDias / g.nViajes) : 0,
    promAlojDia: g.nConAloj ? Math.round(g.sumaAlojDia / g.nConAloj) : 0,
    promComidaDia: g.nConComida ? Math.round(g.sumaComidaDia / g.nConComida) : 0,
    promCombustible: g.nConCombustible ? Math.round(g.sumaCombustible / g.nConCombustible) : 0,
    promPasaje: g.nConPasaje ? Math.round(g.sumaPasaje / g.nConPasaje) : 0,
    promMovilidad: g.nConMovilidad ? Math.round(g.sumaMovilidad / g.nConMovilidad) : 0,
    viajes: g.viajes
  }));
  return resultado.sort((a, b) => b.totalNeto - a.totalNeto);
}

/* Días de un viaje (inclusive: salida y regreso cuentan) */
export function calcularDias(fechaSalida, fechaRegreso) {
  if (!fechaSalida || !fechaRegreso) return 1;
  const s = new Date(fechaSalida + 'T00:00:00');
  const r = new Date(fechaRegreso + 'T00:00:00');
  const ms = r - s;
  if (isNaN(ms) || ms < 0) return 1;
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/* Gasto operativo total de un viaje, con desglose por rubro */
export async function calcularGastoViaje(viaje) {
  const ciudad = await getCiudad(viaje.ciudad_id);
  const dias = calcularDias(viaje.fecha_salida, viaje.fecha_regreso);

  /* Gastos reales cargados para ESTE viaje (por rubro).
     Cada rubro es una LISTA de gastos {monto, fecha, txnId} que se suman.
     Compat: si viene como número (datos viejos), se trata como un solo gasto. */
  const real = viaje.gastos_reales || {};
  const sumaRubro = (rubro) => {
    const v = real[rubro];
    if (v == null || v === '') return null;        // no hay real → usar estimado
    if (Array.isArray(v)) {
      if (!v.length) return null;
      return v.reduce((a, g) => a + numSeguro(g.monto, 0), 0);
    }
    return numSeguro(v, 0);                          // número viejo
  };
  const tieneReal = (rubro) => sumaRubro(rubro) != null;

  const alojDia   = ciudad ? numSeguro(ciudad.alojamiento_dia, 0) : 0;
  const comidaDia = ciudad ? numSeguro(ciudad.comida_dia, 0) : 0;
  const alojamientoEst = alojDia * dias;
  const comidaEst      = comidaDia * dias;

  const fijo = await costoFijoCiudad(ciudad);

  /* ── PISO DEL ESTIMADO (regla clave) ──────────────────────────────
     Mientras el viaje está EN CURSO (o futuro), el gasto de cada rubro
     nunca baja del estimado: se usa el MAYOR entre estimado y real
     acumulado. Así el piso de rentabilidad no se desarma al cargar
     gastos reales chiquitos día a día.
     Cuando el viaje TERMINÓ, vale el real (para historial y promedios). */
  const hoy = fechaHoy();
  const terminado = viaje.fecha_regreso ? (hoy > viaje.fecha_regreso.slice(0, 10)) : false;

  const aplicar = (rubro, estimadoVal) => {
    const realVal = sumaRubro(rubro);
    if (realVal == null) return estimadoVal;          // sin real → estimado
    if (terminado) return realVal;                    // terminado → real
    return Math.max(estimadoVal, realVal);            // en curso → piso del estimado
  };

  const alojamiento = aplicar('alojamiento', alojamientoEst);
  const comida      = aplicar('comida', comidaEst);
  const combustible = aplicar('combustible', fijo.combustible);
  const pasaje      = aplicar('pasaje', fijo.pasaje);
  const movilidad   = aplicar('movilidad', fijo.movilidad);

  /* ¿El rubro se está mostrando con el valor real? (real presente y, si en
     curso, además supera el estimado). Para la marca visual "real". */
  const esRealEfectivo = (rubro, estimadoVal) => {
    const realVal = sumaRubro(rubro);
    if (realVal == null) return false;
    if (terminado) return true;
    return realVal >= estimadoVal;
  };

  /* Gastos extra del período (herramienta rota, uber adicional, etc.) */
  const extras = Array.isArray(viaje.gastos_extra) ? viaje.gastos_extra : [];
  const totalExtras = extras.reduce((a, g) => a + numSeguro(g.monto, 0), 0);

  const total = alojamiento + comida + combustible + pasaje + movilidad + totalExtras;

  return {
    dias,
    alojamiento, comida, combustible, pasaje, movilidad,
    extras: totalExtras,
    total,
    /* Marcas de qué rubros se muestran con valor real (para la UI) */
    esReal: {
      alojamiento: esRealEfectivo('alojamiento', alojamientoEst),
      comida:      esRealEfectivo('comida', comidaEst),
      combustible: esRealEfectivo('combustible', fijo.combustible),
      pasaje:      esRealEfectivo('pasaje', fijo.pasaje),
      movilidad:   esRealEfectivo('movilidad', fijo.movilidad)
    },
    /* Estimados (para comparar y para el comparador auto/colectivo) */
    estimado: { alojamiento: alojamientoEst, comida: comidaEst, combustible: fijo.combustible, pasaje: fijo.pasaje, movilidad: fijo.movilidad },
    ciudad_nombre: ciudad ? ciudad.nombre : (viaje.ciudad || '—')
  };
}

/* ── COMPARADOR AUTO vs COLECTIVO ────────────────────────────────────
   Calcula cuánto saldría el viaje en auto vs en colectivo, usando los
   datos de la ciudad y el precio de nafta. Alojamiento, comida y
   movilidad son iguales en ambos; cambia el transporte. */
export async function compararTransporte(viaje) {
  const ciudad = await getCiudad(viaje.ciudad_id);
  if (!ciudad) return null;
  const dias = calcularDias(viaje.fecha_salida, viaje.fecha_regreso);

  const alojamiento = numSeguro(ciudad.alojamiento_dia, 0) * dias;
  const comida      = numSeguro(ciudad.comida_dia, 0) * dias;
  const movilidad   = numSeguro(ciudad.movilidad_local, 0);
  const base = alojamiento + comida + movilidad;

  /* Auto: combustible ida y vuelta */
  const { precio, rendimiento } = await getCombustibleGlobal();
  const combustible = calcularCombustible(numSeguro(ciudad.km, 0) * 2, precio, rendimiento);
  const totalAuto = base + combustible;

  /* Colectivo: pasaje ida y vuelta (2 pasajes) */
  const pasaje = numSeguro(ciudad.pasaje, 0) * 2;
  const totalColectivo = base + pasaje;

  const ahorro = Math.abs(totalAuto - totalColectivo);
  const conviene = totalAuto <= totalColectivo ? 'auto' : 'colectivo';

  return {
    dias, base,
    auto:      { combustible, total: totalAuto },
    colectivo: { pasaje, total: totalColectivo },
    conviene, ahorro,
    tienePasaje: numSeguro(ciudad.pasaje, 0) > 0
  };
}

export async function guardarViaje(viaje) {
  const db = _db();
  const fechaSalida = viaje.fecha_salida || '';
  const data = {
    ciudad_id:     viaje.ciudad_id || null,
    ciudad:        viaje.ciudad || '',          // nombre congelado por si borran la ciudad
    fecha_salida:  fechaSalida,
    fecha_regreso: viaje.fecha_regreso || fechaSalida,
    transporte:    viaje.transporte || 'auto',
    gastos_extra:  Array.isArray(viaje.gastos_extra) ? viaje.gastos_extra : [],
    gastos_reales: viaje.gastos_reales || {},
    egresos_reales: viaje.egresos_reales || {},
    trabajos_incluidos: Array.isArray(viaje.trabajos_incluidos) ? viaje.trabajos_incluidos : [],
    trabajos_excluidos: Array.isArray(viaje.trabajos_excluidos) ? viaje.trabajos_excluidos : [],
    estado:        viaje.estado || 'planificado', // 'planificado' | 'en_curso' | 'cerrado'
    anio:          fechaSalida ? fechaSalida.slice(0, 4) : String(new Date().getFullYear()),
    notas:         viaje.notas || '',
    actualizado_at: new Date().toISOString()
  };
  if (viaje.id) data.id = viaje.id;
  if (!data.ciudad_id && !data.ciudad) throw new Error('El viaje necesita una ciudad');
  return await dbPut(db, 'viajes_operativos', data);
}

export async function eliminarViaje(id) {
  const db = _db();
  /* Borrar también los egresos que este viaje haya creado en la caja */
  try {
    const viaje = await getViaje(id);
    const reales = (viaje && viaje.gastos_reales) || {};
    const txnIds = [];
    for (const rubro in reales) {
      const lista = Array.isArray(reales[rubro]) ? reales[rubro] : [];
      for (const g of lista) if (g.txnId) txnIds.push(g.txnId);
    }
    /* Compat: formato viejo egresos_reales */
    const egresosViejos = (viaje && viaje.egresos_reales) || {};
    for (const k in egresosViejos) if (egresosViejos[k]) txnIds.push(egresosViejos[k]);

    if (txnIds.length) {
      const movs = await dbGetAll(db, 'finance_movements', false).catch(() => []);
      for (const txnId of txnIds) {
        const mov = movs.find(m => m.transaction_id === txnId);
        if (mov) await dbDelete(db, 'finance_movements', mov.id != null ? mov.id : mov.transaction_id);
      }
    }
  } catch (e) { /* nada */ }
  return await dbDelete(db, 'viajes_operativos', id);
}

/* ── GASTOS REALES por rubro (acumulables día a día) ─────────────────
   AGREGA un gasto al rubro (se suma a lo ya cargado) y lo registra como
   egreso individual en la caja. Pensado para cargar sobre la marcha. */
export async function agregarGastoRealDiario(viajeId, rubro, monto, concepto) {
  const viaje = await getViaje(viajeId);
  if (!viaje) return null;
  const montoNum = numSeguro(monto, 0);
  if (montoNum <= 0) return null;

  const reales = viaje.gastos_reales || {};
  /* Migrar dato viejo (número) a lista si hace falta */
  if (reales[rubro] != null && !Array.isArray(reales[rubro])) {
    const viejo = numSeguro(reales[rubro], 0);
    reales[rubro] = viejo > 0 ? [{ monto: viejo, fecha: viaje.fecha_salida || '', concepto: 'Cargado antes', txnId: null }] : [];
  }
  if (!Array.isArray(reales[rubro])) reales[rubro] = [];

  const ciudad = await getCiudad(viaje.ciudad_id);
  const ciudadNombre = ciudad ? ciudad.nombre : (viaje.ciudad || 'viaje');
  const nombreRubro = { alojamiento: 'Alojamiento', comida: 'Comida', combustible: 'Combustible', pasaje: 'Pasaje', movilidad: 'Movilidad' }[rubro] || rubro;
  const hoyISO = fechaHoy();
  const db = _db();

  /* Crear egreso individual en la caja */
  let txnId = null;
  try {
    txnId = 'txn_viaje_' + viajeId + '_' + rubro + '_' + Date.now();
    const txn = {
      transaction_id: txnId,
      type:        'expense',
      category:    'viaje',
      amount:      montoNum,
      date:        hoyISO,
      description: `${nombreRubro}${concepto ? ' (' + concepto + ')' : ''} — viaje a ${ciudadNombre}`,
      notes:       'Gasto real de viaje operativo',
      base:        'SMA',
      related_order_id: null,
      viaje_id:    viajeId,
      created_at:  new Date().toISOString()
    };
    await dbPut(db, 'finance_movements', txn);
  } catch (e) { txnId = null; }

  reales[rubro].push({ monto: montoNum, fecha: hoyISO, concepto: concepto || '', txnId });
  viaje.gastos_reales = reales;
  await guardarViaje(viaje);

  /* Total acumulado del rubro */
  const totalRubro = reales[rubro].reduce((a, g) => a + numSeguro(g.monto, 0), 0);

  /* Sugerencia de actualizar ciudad (sobre el total acumulado).
     SOLO tiene sentido cuando el viaje terminó (datos completos): si todavía
     está en curso, el promedio por día sería engañoso (faltan días por cargar). */
  const dias = calcularDias(viaje.fecha_salida, viaje.fecha_regreso) || 1;
  const hoy = fechaHoy();
  const viajeTerminado = viaje.fecha_regreso ? (hoy > viaje.fecha_regreso.slice(0, 10)) : false;

  let valorCiudadSugerido = totalRubro, campoCiudad = null;
  if (rubro === 'alojamiento') { valorCiudadSugerido = Math.round(totalRubro / dias); campoCiudad = 'alojamiento_dia'; }
  else if (rubro === 'comida') { valorCiudadSugerido = Math.round(totalRubro / dias); campoCiudad = 'comida_dia'; }
  else if (rubro === 'pasaje') { valorCiudadSugerido = Math.round(totalRubro / 2); campoCiudad = 'pasaje'; }
  else if (rubro === 'movilidad') { campoCiudad = 'movilidad_local'; }
  const valorActual = (ciudad && campoCiudad) ? numSeguro(ciudad[campoCiudad], 0) : 0;

  return {
    rubro, totalRubro, campoCiudad, valorCiudadSugerido, valorActual,
    viajeTerminado,
    /* Solo sugerir si el viaje terminó Y el cambio es significativo */
    cambioSignificativo: viajeTerminado && campoCiudad && valorActual > 0 && Math.abs(valorCiudadSugerido - valorActual) > (valorActual * 0.05),
    ciudadId: viaje.ciudad_id, ciudadNombre
  };
}

/* Quitar UN gasto puntual de un rubro (por índice) y borrar su egreso */
export async function quitarGastoRealItem(viajeId, rubro, idx) {
  const viaje = await getViaje(viajeId);
  if (!viaje) return;
  const reales = viaje.gastos_reales || {};
  if (!Array.isArray(reales[rubro])) return;
  const item = reales[rubro][idx];
  if (item && item.txnId) {
    try {
      const db = _db();
      const movs = await dbGetAll(db, 'finance_movements', false).catch(() => []);
      const mov = movs.find(m => m.transaction_id === item.txnId);
      if (mov) await dbDelete(db, 'finance_movements', mov.id != null ? mov.id : mov.transaction_id);
    } catch (e) { /* nada */ }
  }
  reales[rubro].splice(idx, 1);
  viaje.gastos_reales = reales;
  await guardarViaje(viaje);
}

/* Listar los gastos de un rubro (para mostrar el detalle) */
export async function listarGastosRubro(viajeId, rubro) {
  const viaje = await getViaje(viajeId);
  if (!viaje) return [];
  const reales = viaje.gastos_reales || {};
  const v = reales[rubro];
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return [{ monto: numSeguro(v, 0), fecha: '', concepto: 'Cargado antes', txnId: null }];
}

/* Actualizar un campo de la estimación de la ciudad (tras confirmación) */
export async function actualizarEstimacionCiudad(ciudadId, campo, valor) {
  const ciudad = await getCiudad(ciudadId);
  if (!ciudad) return;
  ciudad[campo] = numSeguro(valor, 0);
  ciudad.actualizado_at = new Date().toISOString();
  return await dbPut(_db(), 'ciudades_op', ciudad);
}

/* Quitar TODOS los gastos reales de un rubro (volver al estimado) */
export async function quitarGastoReal(viajeId, rubro) {
  const viaje = await getViaje(viajeId);
  if (!viaje) return;
  const reales = viaje.gastos_reales || {};
  /* Borrar todos los egresos asociados al rubro */
  const lista = Array.isArray(reales[rubro]) ? reales[rubro] : [];
  try {
    const db = _db();
    const movs = await dbGetAll(db, 'finance_movements', false).catch(() => []);
    for (const g of lista) {
      if (g.txnId) {
        const mov = movs.find(m => m.transaction_id === g.txnId);
        if (mov) await dbDelete(db, 'finance_movements', mov.id != null ? mov.id : mov.transaction_id);
      }
    }
  } catch (e) { /* nada */ }
  delete reales[rubro];
  viaje.gastos_reales = reales;
  await guardarViaje(viaje);
}

/* ── ANÁLISIS DE RENTABILIDAD DE UN VIAJE ────────────────────────────
   Asocia los trabajos (turnos/órdenes) de la ciudad en las fechas del
   viaje, calcula ingresos facturados, cobrados, y el punto de equilibrio. */

export async function analizarViaje(viaje) {
  const gasto = await calcularGastoViaje(viaje);
  const db = _db();

  /* Trabajos asociados a mano (ids guardados en el viaje) y excluidos a mano */
  const incluidosManual = Array.isArray(viaje.trabajos_incluidos) ? viaje.trabajos_incluidos : [];
  const excluidosManual = Array.isArray(viaje.trabajos_excluidos) ? viaje.trabajos_excluidos : [];

  /* Buscar trabajos en los 4 stores: ING, OTT, OTE, PRE */
  let trabajos = [];
  try {
    const ciudadNorm = (gasto.ciudad_nombre || '').toLowerCase().trim();
    /* Rango de fechas del viaje (para asociar solo trabajos de esas fechas).
       Un trabajo pertenece al viaje si su fecha cae dentro del rango. Esto
       evita que un viaje se trague trabajos de otros viajes de la misma
       ciudad. Si el viaje no tiene fechas cargadas, no se filtra por fecha
       (se mantiene el criterio por ciudad, para no perder nada). */
    const vDesde = (viaje.fecha_salida  || '').slice(0, 10);
    const vHasta = (viaje.fecha_regreso || '').slice(0, 10);
    const hayRango = vDesde && vHasta;
    const enRango = (fechaTrabajo) => {
      if (!hayRango) return true;              // sin rango → no filtra por fecha
      const f = (fechaTrabajo || '').slice(0, 10);
      if (!f) return true;                     // trabajo sin fecha → no se excluye
      return f >= vDesde && f <= vHasta;
    };
    const stores = [
      { store: 'ingresos',     tipo: 'ING' },
      { store: 'ordenes',      tipo: 'OTT' },
      { store: 'exteriors',    tipo: 'OTE' },
      { store: 'presupuestos', tipo: 'PRE' }
    ];
    for (const { store: st, tipo } of stores) {
      const arr = await dbGetAll(db, st, false).catch(() => []);
      for (const t of arr) {
        if (t.es_turno) continue; // los turnos no son trabajos facturables

        /* Un ING que ya se convirtió en OTT/OTE está archivado: no contar
           (ya está representado por su orden, evita duplicar el mismo equipo). */
        if (tipo === 'ING' && (t.archivado || t.convertido_a_ott || t.convertido_a_ote || (t.estado || '').includes('archivado'))) continue;

        /* PRE ya convertido en orden → no contar: prevalece la OTT/OTE
           (si no, se suma dos veces la misma plata). */
        if (tipo === 'PRE' && (t.convertido_a_ott || t.convertido_a_ote || t.archivado)) continue;

        /* PRE rechazado/perdido → no es plata que se vaya a cobrar. */
        const estadoPre = (t.estado || '').toLowerCase();
        if (tipo === 'PRE' && (estadoPre.includes('rechaz') || estadoPre.includes('cancel') || estadoPre.includes('perdid'))) continue;

        const numero = t.numero || t.id;
        const idStr = String(numero);

        /* Excluido a mano → fuera siempre */
        if (excluidosManual.includes(idStr)) continue;

        /* Incluido a mano → entra siempre (respeta tu decisión, aunque
           esté fuera del rango de fechas del viaje). */
        const estaIncluidoManual = incluidosManual.includes(idStr);

        /* Detección automática por CIUDAD + FECHA dentro del rango del viaje.
           - La fecha es lo que define pertenencia: un trabajo entregado o
             cerrado de ESTE viaje SÍ cuenta (está en el rango); un trabajo
             de otro viaje de la misma ciudad NO (queda fuera del rango).
           - Los PRE (sin aprobar) no se auto-detectan: plata no confirmada. */
        const ciu = (t.cliente_ciudad || t.zona || '').toLowerCase().trim();
        const fechaTrab = t.fecha || t.creado_at || t.fecha_creacion || '';
        const autoDetectado = ciu === ciudadNorm && ciudadNorm !== '' && tipo !== 'PRE' && enRango(fechaTrab);

        if (estaIncluidoManual || autoDetectado) {
          trabajos.push({ ...t, _tipo: tipo, _numero: numero, _idStr: idStr, _manual: estaIncluidoManual });
        }
      }
    }

    /* Filtro extra de respaldo: si quedó algún ING con misma combinación
       cliente+equipo que una OTT/OTE ya incluida, quitarlo (doble seguridad). */
    const claveOTT = new Set();
    for (const t of trabajos) {
      if (t._tipo === 'OTT' || t._tipo === 'OTE') {
        claveOTT.add(((t.cliente_nombre || '') + '|' + (t.equipo_tipo || t.equipo || '')).toLowerCase().trim());
      }
    }
    trabajos = trabajos.filter(t => {
      if (t._tipo !== 'ING') return true;
      const clave = ((t.cliente_nombre || '') + '|' + (t.equipo_tipo || t.equipo || '')).toLowerCase().trim();
      return !claveOTT.has(clave);
    });

    /* Mantenimientos: por ciudad + fecha programada en el rango */
    const mants = await dbGetAll(db, 'mantenimientos', false).catch(() => []);
    for (const m of mants) {
      const idStr = 'MANT-' + (m.id);
      if (excluidosManual.includes(idStr)) continue;
      const estaIncluidoManual = incluidosManual.includes(idStr);
      const ciu = (m.cliente_ciudad || m.zona || '').toLowerCase().trim();
      const f = (m.proxima_fecha || '').slice(0, 10);
      const enRango = (!viaje.fecha_salida || !viaje.fecha_regreso) ? true : (f >= viaje.fecha_salida && f <= viaje.fecha_regreso);
      const autoDetectado = ciu === ciudadNorm && ciudadNorm !== '' && enRango;
      if (estaIncluidoManual || autoDetectado) {
        trabajos.push({
          ...m, _tipo: 'MANT', _numero: idStr, _idStr: idStr, _manual: estaIncluidoManual,
          total: numSeguro(m.costo || m.monto || m.precio, 0),
          cliente_nombre: m.cliente_nombre
        });
      }
    }

    /* Suscripciones (abonos): por ciudad. La cuota cuenta si la atendés en el viaje. */
    const subs = await dbGetAll(db, 'abonos', false).catch(() => []);
    for (const s of subs) {
      const idStr = 'SUSC-' + (s.id);
      if (excluidosManual.includes(idStr)) continue;
      const estaIncluidoManual = incluidosManual.includes(idStr);
      const ciu = (s.cliente_ciudad || s.zona || '').toLowerCase().trim();
      /* Las suscripciones no tienen fecha de viaje propia: se asocian por ciudad.
         Por defecto se detectan por ciudad; el usuario las confirma/quita a mano. */
      const autoDetectado = ciu === ciudadNorm && ciudadNorm !== '';
      if (estaIncluidoManual || autoDetectado) {
        trabajos.push({
          ...s, _tipo: 'SUSC', _numero: idStr, _idStr: idStr, _manual: estaIncluidoManual,
          total: numSeguro(s.cuota, 0),
          cliente_nombre: s.cliente_nombre
        });
      }
    }
  } catch (e) { trabajos = []; }

  /* ── REGLA PREVIO vs NUEVO ─────────────────────────────────────────
     - Trabajo "previo": ya tenía un pago/adelanto ANTES de la salida del
       viaje → el viaje cuenta solo el SALDO (total − pagado), porque el
       adelanto ya entró antes del viaje.
     - Trabajo "nuevo": no tenía pagos antes de la salida → el viaje cuenta
       el TOTAL facturado (toda la plata se genera en el contexto del viaje).
     "facturado" del viaje = suma de esos montos efectivos.
     "cobrado" = suma de todos los pagos reales (sin importar previo/nuevo). */
  const salida = (viaje.fecha_salida || '').slice(0, 10);
  let facturado = 0, cobrado = 0;
  for (const t of trabajos) {
    const total = numSeguro(t.total, 0);
    const pagos = (t.r && Array.isArray(t.r.pagos)) ? t.r.pagos : [];
    const pagadoTotal = pagos.reduce((a, p) => a + numSeguro(p.monto, 0), 0);
    cobrado += pagadoTotal;

    /* ¿Tiene algún pago con fecha ANTERIOR a la salida del viaje? → previo */
    const pagadoAntes = pagos.reduce((a, p) => {
      const fp = (p.fecha || '').slice(0, 10);
      return (salida && fp && fp < salida) ? a + numSeguro(p.monto, 0) : a;
    }, 0);
    const esPrevio = pagadoAntes > 0;

    if (esPrevio) {
      /* Previo → cuenta el saldo (lo que resta cobrar) */
      facturado += Math.max(0, total - pagadoTotal);
    } else {
      /* Nuevo → cuenta el total facturado */
      facturado += total;
    }
  }

  const nTrabajos = trabajos.length;
  /* Para dividir el gasto operativo, contar SOLO los trabajos con monto > 0.
     Un ING/trabajo en $0 (sin presupuesto aún) no debe achicar el costo por trabajo. */
  const nConMonto = trabajos.filter(t => numSeguro(t.total, 0) > 0).length;
  const gastoPorTrabajo = nConMonto > 0 ? Math.round(gasto.total / nConMonto) : gasto.total;

  const ciudad = await getCiudad(viaje.ciudad_id);
  const margenMin = ciudad ? numSeguro(ciudad.margen_minimo, 30) : 30;
  const objetivo = margenMin < 100 ? Math.round(gasto.total / (1 - margenMin / 100)) : gasto.total;

  const cobertura = objetivo > 0 ? Math.round((facturado / objetivo) * 100) : 0;
  const faltante  = Math.max(0, objetivo - facturado);

  const netoProyectado = facturado - gasto.total;
  const netoRealizado  = cobrado - gasto.total;

  let semaforo = 'rojo';
  if (facturado >= objetivo)        semaforo = 'verde';
  else if (facturado >= gasto.total) semaforo = 'amarillo';

  const ticketProm = nConMonto > 0 ? Math.round(facturado / nConMonto) : 0;
  const trabajosFaltan = (faltante > 0 && ticketProm > 0)
    ? Math.ceil(faltante / ticketProm)
    : 0;

  return {
    gasto, trabajos, nTrabajos, nConMonto, gastoPorTrabajo,
    facturado, cobrado,
    objetivo, cobertura, faltante,
    netoProyectado, netoRealizado,
    semaforo, ticketProm, trabajosFaltan,
    margenMin
  };
}

/* ── Costo de viaje REPARTIDO entre los trabajos del viaje activo ──────
   Para el score de turnos: si hay un viaje activo a esa ciudad, el costo
   del viaje NO se le carga entero a un turno, sino dividido entre todos
   los trabajos del viaje (+1 por el turno nuevo que se está evaluando).
   Devuelve { hayViaje, costoPorTrabajo, nTrabajos } o null si no hay viaje. */
export async function costoViajeRepartido(ciudadNombre) {
  if (!ciudadNombre) return null;
  try {
    const norm = (s) => (s || '').toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const objetivo = norm(ciudadNombre);

    const todos = await listarViajes();
    /* Buscar un viaje ACTIVO (o por cerrar) a esa ciudad */
    const viaje = todos.find(v => {
      const est = estadoViaje(v);
      if (est !== 'activo' && est !== 'por_cerrar') return false;
      const ciu = norm(v.ciudad || v.ciudad_nombre || '');
      return ciu === objetivo;
    });
    if (!viaje) return null;

    const a = await analizarViaje(viaje);
    const costoTotal = a.gasto?.total || 0;
    /* +1: el turno nuevo que se evalúa también será un trabajo del viaje */
    const nEfectivo = Math.max(1, (a.nConMonto || 0) + 1);
    return {
      hayViaje: true,
      costoPorTrabajo: Math.round(costoTotal / nEfectivo),
      nTrabajos: nEfectivo
    };
  } catch (e) {
    return null;
  }
}
export async function listarTrabajosParaAsociar(viaje) {
  const db = _db();
  const incluidos = Array.isArray(viaje.trabajos_incluidos) ? viaje.trabajos_incluidos : [];
  const excluidos = Array.isArray(viaje.trabajos_excluidos) ? viaje.trabajos_excluidos : [];
  const ciudad = await getCiudad(viaje.ciudad_id);
  const ciudadNorm = (ciudad ? ciudad.nombre : viaje.ciudad || '').toLowerCase().trim();

  /* Rango de fechas del viaje: un trabajo pertenece al viaje si su fecha
     cae dentro. Evita que un viaje muestre trabajos de otros viajes de la
     misma ciudad. Sin fechas cargadas → no filtra por fecha (no pierde nada). */
  const vDesde = (viaje.fecha_salida  || '').slice(0, 10);
  const vHasta = (viaje.fecha_regreso || '').slice(0, 10);
  const hayRango = vDesde && vHasta;
  const enRango = (fechaTrabajo) => {
    if (!hayRango) return true;
    const f = (fechaTrabajo || '').slice(0, 10);
    if (!f) return true;
    return f >= vDesde && f <= vHasta;
  };

  const stores = [
    { store: 'ingresos',     tipo: 'ING' },
    { store: 'ordenes',      tipo: 'OTT' },
    { store: 'exteriors',    tipo: 'OTE' },
    { store: 'presupuestos', tipo: 'PRE' }
  ];
  const resultado = [];
  for (const { store: st, tipo } of stores) {
    const arr = await dbGetAll(db, st, false).catch(() => []);
    for (const t of arr) {
      if (t.es_turno) continue;

      /* ING ya convertido en OTT/OTE → no mostrar (archivado) */
      if (tipo === 'ING' && (t.archivado || t.convertido_a_ott || t.convertido_a_ote || (t.estado || '').includes('archivado'))) continue;

      /* PRE ya convertido en OTT/OTE → NO mostrar: prevalece la orden.
         (Si no, se contaría dos veces la misma plata: el PRE y su OTE.) */
      if (tipo === 'PRE' && (t.convertido_a_ott || t.convertido_a_ote || t.archivado)) continue;

      /* PRE rechazado → NO cuenta: es plata que no se va a cobrar. */
      const estadoPre = (t.estado || '').toLowerCase();
      if (tipo === 'PRE' && (estadoPre.includes('rechaz') || estadoPre.includes('cancel') || estadoPre.includes('perdid'))) continue;

      const numero = t.numero || t.id;
      const idStr = String(numero);
      const ciu = (t.cliente_ciudad || t.zona || '').toLowerCase().trim();
      const fechaTrab = t.fecha || t.creado_at || t.fecha_creacion || '';
      /* Auto-detección por CIUDAD + FECHA dentro del rango del viaje.
         La fecha define pertenencia: un trabajo cerrado de ESTE viaje sí
         aparece (está en el rango); uno de otro viaje de la misma ciudad no.
         Un PRE (sin aprobar) no se auto-asocia, pero sí aparece en la lista
         para tildarlo a mano si el trabajo se concreta. */
      const autoDetectado = ciu === ciudadNorm && ciudadNorm !== '' && tipo !== 'PRE' && enRango(fechaTrab);
      const incluido = incluidos.includes(idStr) || (autoDetectado && !excluidos.includes(idStr));
      resultado.push({
        tipo, numero, idStr,
        cliente: t.cliente_nombre || '—',
        equipo: t.equipo_tipo || t.equipo || '',
        total: numSeguro(t.total, 0),
        ciudad: t.cliente_ciudad || t.zona || '',
        autoDetectado,
        incluido
      });
    }
  }

  /* Mantenimientos */
  const mants = await dbGetAll(db, 'mantenimientos', false).catch(() => []);
  for (const m of mants) {
    const idStr = 'MANT-' + (m.id);
    const ciu = (m.cliente_ciudad || m.zona || '').toLowerCase().trim();
    const autoDetectado = ciu === ciudadNorm && ciudadNorm !== '';
    const incluido = incluidos.includes(idStr) || (autoDetectado && !excluidos.includes(idStr));
    resultado.push({
      tipo: 'MANT', numero: idStr, idStr,
      cliente: m.cliente_nombre || '—',
      equipo: m.equipo || m.descripcion || 'Mantenimiento',
      total: numSeguro(m.costo || m.monto || m.precio, 0),
      ciudad: m.cliente_ciudad || m.zona || '',
      autoDetectado, incluido
    });
  }

  /* Suscripciones */
  const subs = await dbGetAll(db, 'abonos', false).catch(() => []);
  for (const s of subs) {
    const idStr = 'SUSC-' + (s.id);
    const ciu = (s.cliente_ciudad || s.zona || '').toLowerCase().trim();
    const autoDetectado = ciu === ciudadNorm && ciudadNorm !== '';
    const incluido = incluidos.includes(idStr) || (autoDetectado && !excluidos.includes(idStr));
    resultado.push({
      tipo: 'SUSC', numero: idStr, idStr,
      cliente: s.cliente_nombre || '—',
      equipo: s.equipo || 'Suscripción',
      total: numSeguro(s.cuota, 0),
      ciudad: s.cliente_ciudad || s.zona || '',
      autoDetectado, incluido
    });
  }
  /* Ordenar: incluidos primero, después por número */
  resultado.sort((a, b) => (b.incluido - a.incluido) || a.numero.localeCompare(b.numero));
  return resultado;
}

/* Alternar la inclusión de un trabajo en un viaje (agregar/quitar a mano) */
export async function toggleTrabajoEnViaje(viajeId, idStr, autoDetectado) {
  const viaje = await getViaje(viajeId);
  if (!viaje) return;
  let incluidos = Array.isArray(viaje.trabajos_incluidos) ? viaje.trabajos_incluidos : [];
  let excluidos = Array.isArray(viaje.trabajos_excluidos) ? viaje.trabajos_excluidos : [];

  const estaIncluido = incluidos.includes(idStr) || (autoDetectado && !excluidos.includes(idStr));

  if (estaIncluido) {
    /* Quitar: si era manual lo saco de incluidos; si era auto lo agrego a excluidos */
    incluidos = incluidos.filter(x => x !== idStr);
    if (autoDetectado && !excluidos.includes(idStr)) excluidos.push(idStr);
  } else {
    /* Agregar: lo saco de excluidos y lo meto en incluidos */
    excluidos = excluidos.filter(x => x !== idStr);
    if (!incluidos.includes(idStr)) incluidos.push(idStr);
  }
  viaje.trabajos_incluidos = incluidos;
  viaje.trabajos_excluidos = excluidos;
  await guardarViaje(viaje);
  return viaje;
}

/* ── SUGERIR VIAJE desde turnos agendados ────────────────────────────
   Mira los turnos futuros, los agrupa por ciudad, y sugiere un viaje
   con la fecha del primer y último turno de esa ciudad. */

export async function sugerirViajes() {
  const db = _db();
  const sugerencias = [];
  try {
    const exteriors = await dbGetAll(db, 'exteriors', false).catch(() => []);
    const ahora = new Date();
    const hoy = fechaHoy();
    const ciudades = await listarCiudades();
    const viajesExistentes = await listarViajes();

    /* ¿Este turno cae dentro de las fechas de un viaje ya creado? (absorbido) */
    const dentroDeViaje = (fechaTurno, ciudadTurno) => {
      return viajesExistentes.some(v => {
        if (!v.fecha_salida || !v.fecha_regreso) return false;
        const f = fechaTurno.slice(0, 10);
        return f >= v.fecha_salida.slice(0, 10) && f <= v.fecha_regreso.slice(0, 10);
      });
    };

    /* Turnos futuros, NO cancelados, hora no pasada, agrupados por ciudad */
    const porCiudad = {};
    for (const t of exteriors) {
      if (!t.es_turno) continue;

      /* Ignorar cancelados, realizados o estados terminales */
      const estado = (t.estado_turno || t.estado || '').toLowerCase();
      if (estado.includes('cancel') || estado.includes('realizado') || estado.includes('complet')) continue;

      /* Ignorar turnos cuya fecha/hora ya pasó */
      const f = (t.fecha || '').slice(0, 10);
      if (!f) continue;
      if (f < hoy) continue;
      /* Si es hoy, chequear la hora */
      if (f === hoy && t.hora) {
        const [hh, mm] = String(t.hora).split(':').map(n => parseInt(n, 10));
        if (!isNaN(hh)) {
          const horaTurno = new Date(); horaTurno.setHours(hh, mm || 0, 0, 0);
          if (horaTurno < ahora) continue; // ya pasó la hora hoy
        }
      }

      const ciu = (t.cliente_ciudad || t.zona || '').toLowerCase().trim();
      if (!ciu) continue;
      /* No sugerir la base local (SMA) */
      if (ciu.includes('san martín') || ciu.includes('san martin') || ciu === 'sma') continue;

      /* Si ya hay un viaje que cubre esa fecha, el turno queda absorbido → no sugerir */
      if (dentroDeViaje(f, ciu)) continue;

      if (!porCiudad[ciu]) porCiudad[ciu] = [];
      porCiudad[ciu].push(t);
    }

    for (const [ciu, turnos] of Object.entries(porCiudad)) {
      const fechas = turnos.map(t => (t.fecha || '').slice(0, 10)).filter(Boolean).sort();
      const ciudadCfg = ciudades.find(c => (c.nombre || '').toLowerCase().trim() === ciu);
      sugerencias.push({
        ciudad: turnos[0].cliente_ciudad || turnos[0].zona || ciu,
        ciudad_id: ciudadCfg ? ciudadCfg.id : null,
        configurada: !!ciudadCfg,
        fecha_salida: fechas[0],
        fecha_regreso: fechas[fechas.length - 1],
        n_turnos: turnos.length
      });
    }
  } catch (e) { /* sin sugerencias */ }
  return sugerencias;
}
