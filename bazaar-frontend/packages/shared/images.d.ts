// Ambient module declarations so TypeScript resolves bundled image imports
// (Vite emits a URL string for each). Used by data/playerSkins.ts skin thumbnails.
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.webp" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.svg" {
  const src: string;
  export default src;
}
