export const MENU_KEY = 'rubber-sheet';
export const ROUTE_NAME = 'home-menu-plugin-rubber-sheet';
export const ROUTE_PATH = 'plugin-rubber-sheet';
export const BOTTOM_KEY = 'rubber-sheet-opacity';
export const OPACITY_KEY = 'cloudtak-rubber-sheet-opacity';
export const SOURCE_ID = 'rubber-sheet-image';
export const LAYER_ID = 'rubber-sheet-raster';
export const EDIT_ROUTE_NAME = 'home-menu-plugin-rubber-sheet-edit';
export const EDIT_ROUTE_PATH = 'plugin-rubber-sheet/edit';
/** Longest image side a sheet is loaded and edited at: desktop, and on a finger-driven device (less memory). */
export const MAX_IMAGE_SIDE_DESKTOP = 4096;
export const MAX_IMAGE_SIDE_COARSE = 2048;
/** Desktop value; the export code path never upscales a smaller sheet. */
export const MAX_IMAGE_SIDE = MAX_IMAGE_SIDE_DESKTOP;
/** Undo steps the image editor keeps (each one is a full RGBA copy of the image). */
export const EDIT_HISTORY_CAP_DESKTOP = 40;
export const EDIT_HISTORY_CAP_COARSE = 10;
/** Default JPEG quality (1–95) for KMZ / GeoTIFF / GeoPDF. Prefer sheetUi.exportQuality at runtime. */
export const JPEG_QUALITY = 85;
export const FORMAT_KEY = 'cloudtak-rubber-sheet-format';
export const QUALITY_KEY = 'cloudtak-rubber-sheet-quality';
