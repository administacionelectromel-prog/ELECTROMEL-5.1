/**
 * ELECTROMEL — components/fab/fab.js
 * Floating Action Button programático.
 * Wrapper sobre el FAB existente en el HTML.
 */

export class FAB {
  /**
   * Abre el menú FAB existente en el DOM.
   */
  static open()  { document.getElementById('fab-menu')?.classList.add('active'); }
  static close() { document.getElementById('fab-menu')?.classList.remove('active'); }
  static toggle() {
    const m = document.getElementById('fab-menu');
    if (m) m.classList.toggle('active');
  }

  /**
   * Agrega dinámicamente una opción al FAB.
   * @param {Object} opt
   * @param {string}   opt.icon
   * @param {string}   opt.name
   * @param {string}   [opt.desc]
   * @param {Function} opt.onClick
   */
  static addOption(opt) {
    const list = document.querySelector('.fab-menu-options');
    if (!list) return;
    const el = document.createElement('button');
    el.type      = 'button';
    el.className = 'fab-menu-opt';
    el.innerHTML = `
      <span class="fab-menu-opt-ico">${opt.icon || ''}</span>
      <div>
        <div class="fab-menu-opt-name">${opt.name || ''}</div>
        ${opt.desc ? `<div class="fab-menu-opt-desc">${opt.desc}</div>` : ''}
      </div>`;
    el.addEventListener('click', () => {
      FAB.close();
      opt.onClick?.();
    });
    list.appendChild(el);
    return el;
  }
}
