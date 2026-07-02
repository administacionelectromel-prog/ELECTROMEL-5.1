/**
 * ELECTROMEL — fallas.js
 * Lista de fallas técnicas de referencia para el técnico.
 * NUEVO en la arquitectura modular v2.
 *
 * Funcionalidades:
 *  - Biblioteca de fallas frecuentes por equipo y categoría
 *  - Búsqueda rápida
 *  - Fallas predefinidas + personalizadas (guardadas en IndexedDB)
 *  - Inserción rápida en formularios activos
 */

import { store }        from '../core/store.js';
import { dbGetAll, dbPut, dbDelete } from '../core/db.js';
import { showToast }    from '../core/ui.js';
import { escapeHtml }   from '../core/utils.js';

/* ── Fallas predefinidas del sistema ────────────────────── */
const FALLAS_DEFAULT = [
  /* Diagnóstico */
  { cat: 'diagnostico', equipo: 'Soldadora Inverter', titulo: 'IGBT en corto circuito',                   desc: 'El módulo IGBT presenta falla de corto entre colector y emisor. Verificar driver de gate y posibles causas de sobretensión.' },
  { cat: 'diagnostico', equipo: 'Soldadora Inverter', titulo: 'Capacitores del bus DC inflados',           desc: 'Capacitores electrolíticos del bus de continua con abombamiento visible. Causa frecuente: envejecimiento o sobrevoltaje de red.' },
  { cat: 'diagnostico', equipo: 'Soldadora Inverter', titulo: 'Driver de gate sin señal de disparo',      desc: 'El circuito driver no genera pulsos de activación para los IGBTs. Verificar alimentación auxiliar y optoacopladores.' },
  { cat: 'diagnostico', equipo: 'Soldadora Inverter', titulo: 'Termistor NTC defectuoso',                 desc: 'Lectura de temperatura errónea o circuito abierto. Causa falsa activación de protección térmica.' },
  { cat: 'diagnostico', equipo: 'Soldadora Inverter', titulo: 'Puente rectificador dañado',               desc: 'Uno o más diodos del puente rectificador de entrada en corto o circuito abierto.' },
  { cat: 'diagnostico', equipo: 'Soldadora Inverter', titulo: 'Bobina de inductancia en corto',           desc: 'Inductancia de filtro de salida con cortocircuito entre espiras. Provoca sobrecorriente en IGBTs.' },
  { cat: 'diagnostico', equipo: 'Soldadora Inverter', titulo: 'Placa de control sin alimentación auxiliar', desc: 'La fuente auxiliar (generalmente +15V, +5V, -15V) no entrega tensión. Revisar transformador auxiliar y reguladores.' },
  { cat: 'diagnostico', equipo: 'Soldadora Inverter', titulo: 'Ventilador trabado / sin giro',            desc: 'El ventilador de refrigeración no gira. Causa sobrecalentamiento y disparo de protección térmica.' },

  /* Fallas declaradas */
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'No regula amperaje',                       desc: 'El equipo no responde al ajuste del potenciómetro de corriente. Verificar encoder o potenciómetro de ajuste y placa de control.' },
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'No enciende / sin display',                desc: 'El equipo no presenta señales de vida al energizarse. Verificar fusible de entrada, placa de control y fuente auxiliar.' },
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'Apaga en caliente (protección térmica)',   desc: 'El equipo se apaga después de varios minutos de uso. Probable causa: ventilador trabado, termistor defectuoso o IGBTs degradados.' },
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'Arco inestable / soldadura irregular',     desc: 'El arco no se mantiene estable. Causas posibles: IGBTs parcialmente dañados, capacitores degradados o problema de inductancia.' },
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'No traba el arco (falla de encendido)',    desc: 'El equipo no logra iniciar el arco. Verificar tensión en vacío, circuito de alta frecuencia (si aplica) y IGBTs.' },
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'Ruido excesivo al soldar',                 desc: 'Zumbido o ruido mecánico anormal durante la operación. Revisar capacitores, transformador y fijaciones internas.' },
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'Error E01 — sobretemperatura',             desc: 'Código de error de temperatura excesiva. Revisar ventilador, termistor NTC y pasta térmica de los IGBTs.' },
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'Error E02 — sobrevoltaje de red',          desc: 'La red de alimentación supera el umbral configurado. Verificar tensión de entrada y comparador de la placa de control.' },
  { cat: 'falla',       equipo: 'Soldadora Inverter', titulo: 'Error E03 — sobrecorriente de salida',     desc: 'La corriente de salida supera el límite de protección. Revisar shunt de medición y el circuito de realimentación.' },

  /* Reparaciones frecuentes */
  { cat: 'reparacion',  equipo: 'Soldadora Inverter', titulo: 'Reemplazo de IGBTs y drivers de gate',    desc: 'Procedimiento: retirar placa de potencia, dessoldar IGBTs dañados, limpiar pads, instalar nuevos con pasta térmica, verificar drivers antes de energizar.' },
  { cat: 'reparacion',  equipo: 'Soldadora Inverter', titulo: 'Cambio de capacitores del bus DC',        desc: 'Reemplazar capacitores electrolíticos 400V. Respetar polaridad. Reformar los nuevos antes de instalación definitiva si el equipo estuvo mucho tiempo guardado.' },
  { cat: 'reparacion',  equipo: 'Soldadora Inverter', titulo: 'Limpieza profunda con aire comprimido',   desc: 'Limpieza completa de polvo y residuos. Especial atención a aletas de disipador, ventilador y placa de control.' },
  { cat: 'reparacion',  equipo: 'Soldadora Inverter', titulo: 'Calibración de corriente de salida',      desc: 'Verificar con amperímetro de gancho. Ajustar preset en placa de control si el equipo lo permite.' },

  /* Materiales frecuentes */
  { cat: 'material',    equipo: 'General',            titulo: 'IGBT 20N60 / 25N60 (par)',               desc: 'Módulo IGBT de canal N, 600V. Usar en pares complementarios del mismo lote.' },
  { cat: 'material',    equipo: 'General',            titulo: 'Capacitor 400V 470µF',                   desc: 'Capacitor electrolítico para bus DC. Siempre usar con rating de temperatura 105°C.' },
  { cat: 'material',    equipo: 'General',            titulo: 'Ventilador 12V DC 120×120mm',            desc: 'Ventilador estándar de refrigeración. Verificar RPM mínimo para el caudal requerido.' },
  { cat: 'material',    equipo: 'General',            titulo: 'Optoacoplador PC817 / TLP250',           desc: 'Para aislación en drivers de gate. El TLP250 para aplicaciones de mayor potencia.' },
  { cat: 'material',    equipo: 'General',            titulo: 'Fusible entrada 20A 500V',               desc: 'Fusible cerámico de acción rápida. No reemplazar con fusibles lentos.' },
  { cat: 'material',    equipo: 'General',            titulo: 'Pasta térmica disipadora',               desc: 'Aplicar capa delgada y uniforme. Limpiar la vieja completamente antes de aplicar.' },
];

let _modalCreado = false;

/* ── Abrir modal de fallas ──────────────────────────────── */
export function abrirModalFallas() {
  if (!_modalCreado) {
    document.body.appendChild(_crearModalFallas());
    _modalCreado = true;
  }
  _renderFallas();
  document.getElementById('modal-fallas').classList.add('active');
}

function _crearModalFallas() {
  const m = document.createElement('div');
  m.id        = 'modal-fallas';
  m.className = 'modal';
  m.innerHTML = `
    <div class="modal-header">
      <button class="modal-close" type="button" onclick="document.getElementById('modal-fallas').classList.remove('active')">×</button>
      <div class="modal-title">🔧 Referencia de Fallas</div>
    </div>
    <div class="modal-body">
      <!-- Buscador -->
      <div class="field" style="margin-bottom:10px;">
        <input type="text" id="fallas-search" placeholder="🔍 Buscar falla, equipo o síntoma..." oninput="_onFallasSearch()" style="font-size:14px;">
      </div>

      <!-- Filtros de categoría -->
      <div class="tabs-inner" id="fallas-cats" style="flex-wrap:wrap;gap:4px;margin-bottom:12px;">
        <button class="tab-inner active" type="button" data-cat="todos" onclick="_filtrarFallas('todos')">Todas</button>
        <button class="tab-inner" type="button" data-cat="falla"       onclick="_filtrarFallas('falla')">Fallas</button>
        <button class="tab-inner" type="button" data-cat="diagnostico" onclick="_filtrarFallas('diagnostico')">Diagnóstico</button>
        <button class="tab-inner" type="button" data-cat="reparacion"  onclick="_filtrarFallas('reparacion')">Reparación</button>
        <button class="tab-inner" type="button" data-cat="material"    onclick="_filtrarFallas('material')">Materiales</button>
        <button class="tab-inner" type="button" data-cat="personalizada" onclick="_filtrarFallas('personalizada')">Mis fallas</button>
      </div>

      <!-- Lista -->
      <div id="fallas-lista"></div>

      <!-- Agregar personalizada -->
      <div class="card" style="background:var(--surface-2);border-color:var(--borde-2);margin-top:12px;">
        <div class="card-title" style="font-size:11px;">➕ AGREGAR FALLA PERSONALIZADA</div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">Categoría</label>
            <select id="falla-nueva-cat">
              <option value="falla">Falla declarada</option>
              <option value="diagnostico">Diagnóstico</option>
              <option value="reparacion">Reparación</option>
              <option value="material">Material</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Equipo</label>
            <input type="text" id="falla-nueva-equipo" placeholder="Soldadora, Motor...">
          </div>
        </div>
        <div class="field">
          <label class="field-label">Título *</label>
          <input type="text" id="falla-nueva-titulo" placeholder="Nombre de la falla">
        </div>
        <div class="field">
          <label class="field-label">Descripción técnica</label>
          <textarea id="falla-nueva-desc" rows="3" placeholder="Causas, síntomas, procedimiento..."></textarea>
        </div>
        <button class="btn btn-primary btn-block" type="button" onclick="_guardarFallaPersonalizada()">➕ Agregar</button>
      </div>
    </div>
  `;
  return m;
}

/* ── Estado del módulo ─────────────────────────────────── */
let _catActiva     = 'todos';
let _searchTerm    = '';
let _searchTimer   = null;

window._filtrarFallas = function(cat) {
  _catActiva = cat;
  document.querySelectorAll('#fallas-cats .tab-inner').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });
  _renderFallas();
};

window._onFallasSearch = function() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    _searchTerm = (document.getElementById('fallas-search')?.value || '').toLowerCase().trim();
    _renderFallas();
  }, 200);
};

async function _renderFallas() {
  const cont = document.getElementById('fallas-lista');
  if (!cont) return;

  /* Fallas del sistema + personalizadas de DB */
  const db           = store.get('db');
  let personalizadas = [];
  if (db) {
    try {
      const all = await dbGetAll(db, 'fallas');
      personalizadas = all.map(f => ({ ...f, personalizada: true }));
    } catch(e) {}
  }

  const todas = [...FALLAS_DEFAULT.map(f => ({ ...f, personalizada: false })), ...personalizadas];

  /* Filtrar */
  const filtradas = todas.filter(f => {
    const catOk = _catActiva === 'todos' ||
                  (_catActiva === 'personalizada' ? f.personalizada : f.cat === _catActiva);
    if (!catOk) return false;
    if (!_searchTerm) return true;
    return (f.titulo + ' ' + (f.desc || '') + ' ' + (f.equipo || '')).toLowerCase().includes(_searchTerm);
  });

  if (!filtradas.length) {
    cont.innerHTML = '<div class="dim txt-sm" style="padding:12px;">Sin resultados.</div>';
    return;
  }

  cont.innerHTML = filtradas.map((f, i) => `
    <div class="falla-item" style="
      background:var(--surface-2);border:1px solid var(--borde-2);
      border-radius:var(--r-sm);padding:12px;margin-bottom:8px;
      border-left:3px solid ${_catColor(f.cat)};
    ">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;">
          <div class="bold" style="font-size:13px;margin-bottom:3px;">${escapeHtml(f.titulo)}</div>
          <div class="dim" style="font-size:10px;margin-bottom:6px;">
            ${escapeHtml(f.equipo || 'General')} &nbsp;·&nbsp;
            <span style="color:${_catColor(f.cat)}">${_catLabel(f.cat)}</span>
          </div>
          ${f.desc ? `<div style="font-size:12px;line-height:1.5;color:var(--texto-2);">${escapeHtml(f.desc)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
          <button class="btn btn-ghost btn-sm" type="button"
            onclick="_insertarFalla(${JSON.stringify(f.titulo + (f.desc ? '\n' + f.desc : '')).replace(/'/g, "\\'")})"
            title="Insertar en campo activo" style="font-size:11px;">📋 Insertar</button>
          ${f.personalizada ? `<button class="btn btn-ghost btn-sm" type="button"
            onclick="_eliminarFallaPersonalizada(${f.id})"
            style="color:var(--peligro);font-size:11px;">✕ Eliminar</button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

window._insertarFalla = function(texto) {
  const lastField = store.get('ui.lastActiveField');
  if (lastField && document.body.contains(lastField)) {
    const cur = lastField.value || '';
    const sep = cur && !cur.endsWith('\n') ? '\n' : '';
    lastField.value = cur + sep + texto;
    lastField.dispatchEvent(new Event('input', { bubbles: true }));
    lastField.focus();
    showToast('✓ Falla insertada', 'success');
  } else {
    /* Copiar al portapapeles */
    try {
      navigator.clipboard.writeText(texto).then(() => {
        showToast('📋 Texto copiado (sin campo activo)', 'info');
      });
    } catch(e) {
      showToast('📋 No hay campo activo — seleccioná uno primero', 'warn');
    }
  }
};

window._guardarFallaPersonalizada = async function() {
  const db    = store.get('db');
  if (!db) { showToast('⚠️ DB no disponible', 'warn'); return; }

  const titulo = document.getElementById('falla-nueva-titulo')?.value?.trim();
  const desc   = document.getElementById('falla-nueva-desc')?.value?.trim()  || '';
  const cat    = document.getElementById('falla-nueva-cat')?.value           || 'falla';
  const equipo = document.getElementById('falla-nueva-equipo')?.value?.trim() || 'General';

  if (!titulo) { showToast('⚠️ Escribí un título', 'warn'); return; }

  try {
    await dbPut(db, 'fallas', { cat, equipo, titulo, desc, creada_at: new Date().toISOString() });
    document.getElementById('falla-nueva-titulo').value = '';
    document.getElementById('falla-nueva-desc').value   = '';
    showToast('✓ Falla guardada', 'success');
    _renderFallas();
  } catch(e) {
    showToast('❌ Error al guardar', 'error');
  }
};

window._eliminarFallaPersonalizada = async function(id) {
  const db = store.get('db');
  if (!db || !id) return;
  try {
    await dbDelete(db, 'fallas', id);
    showToast('Eliminado', 'info');
    _renderFallas();
  } catch(e) {
    showToast('❌ Error al eliminar', 'error');
  }
};

function _catColor(cat) {
  const colors = {
    falla:       '#e05050',
    diagnostico: '#5090d0',
    reparacion:  '#4caf7d',
    material:    '#e8a020',
    personalizada: '#9c6fca'
  };
  return colors[cat] || '#888';
}

function _catLabel(cat) {
  const labels = {
    falla: 'Falla', diagnostico: 'Diagnóstico',
    reparacion: 'Reparación', material: 'Material', personalizada: 'Personalizada'
  };
  return labels[cat] || cat;
}
