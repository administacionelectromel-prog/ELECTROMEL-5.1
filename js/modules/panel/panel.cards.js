/**
 * ELECTROMEL — modules/panel/panel.cards.js
 * Render de tarjetas del panel principal y sección archivados.
 * Stats de semáforo.
 */

import { showToast }       from '../../core/ui.js';
import { getColorSemaforo } from '../../core/utils.js';
import { buildTarjeta, buildEmptyState } from './panel.templates.js';
import { getFiltroActivo }  from './panel.store.js';

/* ── renderTarjetas ───────────────────────────────────── */
const TARJETAS_POR_PAGINA = 50;
let _tarjetasVisibles = TARJETAS_POR_PAGINA;
let _ultimaListaFiltrada = [];
let _ultimoOnDetalle = null;

export function renderTarjetas(lista, filtrados, onDetalle) {
  if (!lista) return;
  lista.innerHTML = '';

  if (!filtrados.length) {
    const vacio = getFiltroActivo() === 'TODOS' &&
      !document.getElementById('panel-search')?.value;
    lista.appendChild(buildEmptyState(vacio));
    return;
  }

  /* Guardar para "Ver más" */
  _ultimaListaFiltrada = filtrados;
  _ultimoOnDetalle = onDetalle;
  /* Resetear el conteo cuando cambia la lista (nuevo filtro/búsqueda) */
  _tarjetasVisibles = TARJETAS_POR_PAGINA;

  _pintarPagina(lista);
}

function _pintarPagina(lista) {
  const filtrados = _ultimaListaFiltrada;
  const onDetalle = _ultimoOnDetalle;
  const mostrar = filtrados.slice(0, _tarjetasVisibles);

  lista.innerHTML = '';
  const frag = document.createDocumentFragment();
  mostrar.forEach(r => {
    frag.appendChild(buildTarjeta(r, onDetalle, num => window.crearOTTdesdeING?.(num)));
  });
  lista.appendChild(frag);

  /* Botón "Ver más" si quedan registros */
  if (filtrados.length > _tarjetasVisibles) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-block';
    btn.style.marginTop = '10px';
    btn.textContent = `Ver más (${filtrados.length - _tarjetasVisibles} restantes)`;
    btn.addEventListener('click', () => {
      _tarjetasVisibles += TARJETAS_POR_PAGINA;
      _pintarPagina(lista);
    });
    lista.appendChild(btn);
  }
}

/* ── renderArchivados ─────────────────────────────────── */
let _archivadosVisibles = TARJETAS_POR_PAGINA;
let _ultimosArchivados = [];
let _ultimoOnDetalleArch = null;

export function renderArchivadosLista(cont, archivados, onDetalle) {
  if (!cont) return;
  cont.innerHTML = '';
  if (!archivados.length) {
    cont.innerHTML = '<div class="empty"><div class="empty-text dim">Sin archivados.</div></div>';
    return;
  }
  _ultimosArchivados = archivados;
  _ultimoOnDetalleArch = onDetalle;
  _archivadosVisibles = TARJETAS_POR_PAGINA;
  _pintarArchivados(cont);
}

function _pintarArchivados(cont) {
  const archivados = _ultimosArchivados;
  const mostrar = archivados.slice(0, _archivadosVisibles);
  cont.innerHTML = '';
  const frag = document.createDocumentFragment();
  mostrar.forEach(r => frag.appendChild(buildTarjeta(r, _ultimoOnDetalleArch, null)));
  cont.appendChild(frag);

  if (archivados.length > _archivadosVisibles) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-block';
    btn.style.marginTop = '10px';
    btn.textContent = `Ver más (${archivados.length - _archivadosVisibles} restantes)`;
    btn.addEventListener('click', () => {
      _archivadosVisibles += TARJETAS_POR_PAGINA;
      _pintarArchivados(cont);
    });
    cont.appendChild(btn);
  }
}

/* ── actualizarStats ──────────────────────────────────── */
export function actualizarStats(activos) {
  let rojo = 0, amarillo = 0, verde = 0;
  activos.forEach(r => {
    const color = getColorSemaforo(r.estado, r.actualizado_at || r.creado_at);
    if      (color === 'rojo')     rojo++;
    else if (color === 'amarillo') amarillo++;
    else if (color === 'verde')    verde++;
  });
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = String(v); };
  set('stat-rojo',     rojo);
  set('stat-amarillo', amarillo);
  set('stat-verde',    verde);
}
