/**
 * ELECTROMEL — services/media/index.js
 * Punto de entrada del sistema multimedia.
 *
 * Uso rápido:
 *   import { mountPhotoWidget } from './services/media/index.js';
 *   mountPhotoWidget(containerEl, 'OTT-0042', 'OTT');
 */

export { mountPhotoWidget }           from './media.gallery.js';
export { capturePhoto, selectPhoto }  from './media.camera.js';
export { openViewer, closeViewer }    from './media.viewer.js';
export { compressAll, compressBlob,
         compressCanvas, formatSize,
         supportsWebP }               from './media.compress.js';
export { savePhoto, getPhotosByRef,
         deletePhoto, deletePhotosByRef,
         cleanupOldPhotos, getMediaStats,
         openMediaDB }                from './media.store.js';
export { getMediaConfig, loadMediaConfig,
         FOTO_CATEGORIAS, getCategoriaLabel,
         formatBytes, generatePhotoId,
         extractTextFromImage, classifyPhoto,
         compareImages, detectFallas,
         ImageCompressWorkerInterface } from './media.utils.js';
