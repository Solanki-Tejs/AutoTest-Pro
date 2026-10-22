/**
 * AutoTest Pro - Centralized API Configuration
 * Supports production deployments behind Cloudflare, Cloudflare Pages, Tunnels, and local dev.
 */

const rawUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim();

// Clean backend origin (e.g. "https://api.autotest.pro" or "http://localhost:8000")
export const BACKEND_URL = rawUrl
  ? rawUrl.replace(/\/+$/, "").replace(/\/api$/, "")
  : "http://localhost:8000";

// Standard API root endpoint with /api guaranteed
export const API_BASE_URL = `${BACKEND_URL}/api`;

/**
 * Returns absolute asset URL for files uploaded to the backend (e.g. /uploads/proctoring/...)
 */
export function getAssetUrl(path: string | undefined | null): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_URL}${cleanPath}`;
}
