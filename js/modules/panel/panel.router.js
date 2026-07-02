/**
 * ELECTROMEL — modules/panel/panel.router.js
 * Navegación desde el panel: botones de impresión, conversión PRE→OTE.
 */

import { pesos, escapeHtml } from '../../core/utils.js';
import { detalleActual }     from './panel.store.js';
import { cerrarModalDetalle } from './panel.detail.js';

/* ═══════════════════════════════════════════════════════════
   CARD IMPRESIÓN / ACCIONES POR TIPO
   ═══════════════════════════════════════════════════════════ */
export function buildCardImpresion(tipo) {
  const card   = document.createElement('div');
  card.className = 'card';
  const numero  = detalleActual.numero;
  const reg     = detalleActual.registro;
  const estado  = reg?.estado || '';

  /* PRE — acciones especiales */
  if (tipo === 'PRE') {
    card.innerHTML = '<div class="card-title">📝 Acciones del presupuesto</div>';
    const col = document.createElement('div');
    col.className = 'col';

    const yaConvertido = !!reg?.convertido_a_ote;

    if (estado === 'aprobado' && !yaConvertido) {
      const btnOTE = document.createElement('button');
      btnOTE.className = 'btn btn-primary btn-block'; btnOTE.type = 'button';
      btnOTE.textContent = '🚐 Convertir en Orden de Trabajo Exterior';
      btnOTE.addEventListener('click', () => {
        cerrarModalDetalle();
        setTimeout(() => window.crearOTEdesdePRE?.(numero), 100);
      });
      col.appendChild(btnOTE);
    } else if (yaConvertido) {
      const badge = document.createElement('div');
      badge.className = 'dim txt-sm';
      badge.style.cssText = 'padding:8px;text-align:center;color:var(--exito);';
      badge.textContent = '✅ Ya convertido → ' + reg.convertido_a_ote;
      col.appendChild(badge);
    } else if (estado !== 'aprobado' && !detalleActual.archivado) {
      const hint = document.createElement('div');
      hint.className = 'dim txt-sm';
      hint.style.cssText = 'padding:8px;text-align:center;';
      hint.textContent = 'Aprobá el presupuesto para poder convertirlo en OTE.';
      col.appendChild(hint);
    }

    if (!detalleActual.archivado) {
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-ghost btn-block'; btnEdit.type = 'button';
      btnEdit.textContent = '✏️ Editar presupuesto';
      btnEdit.addEventListener('click', () => {
        cerrarModalDetalle();
        setTimeout(() => window.abrirEdicionPRE?.(numero), 100);
      });
      col.appendChild(btnEdit);
    }

    const btnPDF = document.createElement('button');
    btnPDF.className = 'btn btn-ghost btn-block'; btnPDF.type = 'button';
    btnPDF.textContent = '🖨️ PDF Presupuesto';
    btnPDF.addEventListener('click', () => window.imprimirPRE_A4?.(numero));
    col.appendChild(btnPDF);

    if ((reg?.materiales_cliente || []).length > 0) {
      const btnMat = document.createElement('button');
      btnMat.className = 'btn btn-ghost btn-block'; btnMat.type = 'button';
      btnMat.textContent = '🛍️ PDF Materiales cliente';
      btnMat.addEventListener('click', () => window.imprimirPRE_ListaMateriales?.(numero));
      col.appendChild(btnMat);
    }

    card.appendChild(col);
    return card;
  }

  /* Otros tipos */
  card.innerHTML = '<div class="card-title">🖨️ Reimprimir</div>';
  const col = document.createElement('div');
  col.className = 'col';

  const btns = {
    ING: [
      { label: '🖨️ PDF A4',      fn: () => window.imprimirING_A4?.(numero) },
      { label: '🧾 Ticket 57mm', fn: () => window.imprimirING_Ticket?.(numero) },
      { label: '🏷️ Etiqueta',   fn: () => window.etiquetaImagenING?.(numero) }
    ],
    OTT: [{ label: '🖨️ PDF A4', fn: () => window.imprimirOTT_A4?.(numero) }],
    OTE: [{ label: '🖨️ PDF A4', fn: () => window.imprimirOTE_A4?.(numero) }],
  }[tipo] || [];

  btns.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-block'; btn.type = 'button';
    btn.textContent = b.label;
    btn.addEventListener('click', b.fn);
    col.appendChild(btn);
  });
  card.appendChild(col);
  return card;
}

/* ── Navegación ───────────────────────────────────────── */
export function irAFormularioDesdePanel(tipo, numero) {
  cerrarModalDetalle();
  const handlers = {
    ING: () => window.abrirFormularioING?.(),
    OTT: () => window.crearOTTdesdeING?.(numero),
    OTE: () => window.abrirFormularioOTE?.(),
    PRE: () => window.abrirFormularioPRE?.()
  };
  setTimeout(() => handlers[tipo]?.(), 100);
}
