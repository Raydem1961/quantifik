/** Exportação estática: todo o app roda no cliente (Firestore em tempo real) e é servido pelo Firebase Hosting. */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
