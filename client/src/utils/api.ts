// In web mode (via Vite proxy) the base is empty — calls are relative.
// In native Capacitor mode set VITE_API_BASE_URL to your backend URL,
// e.g. http://192.168.1.100:3001  or  https://your-backend.railway.app
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}
