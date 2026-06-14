/**
 * ELECTROMEL — components/index.js
 * Registro global de componentes reutilizables.
 * Importar solo lo que se necesite para no cargar todo.
 *
 * Uso:
 *   import { Modal } from '../components/index.js';
 *   const m = new Modal({ title: 'Hola', body: '...' });
 *   m.open();
 */

export { Modal }        from './modal/modal.js';
export { Toast }        from './toast/toast.js';
export { BottomSheet }  from './bottom-sheet/bottom-sheet.js';
export { Autocomplete } from './autocomplete/autocomplete.js';
export { Card }         from './cards/card.js';
export { Tabs }         from './tabs/tabs.js';
export { FAB }          from './fab/fab.js';
export { ImageViewer }  from './image-viewer/image-viewer.js';
export { Gallery }      from './gallery/gallery.js';
export { Camera }       from './camera/camera.js';
