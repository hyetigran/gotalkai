import axios from 'axios';
import Env from 'env';

/**
 * app-service's base URL (ARCHITECTURE.md §3.2) — separate from the
 * shared `@/lib/api` client, which still points at the scaffold's demo
 * feed API (`EXPO_PUBLIC_API_URL`), not app-service.
 */
export const appServiceClient = axios.create({
  baseURL: Env.EXPO_PUBLIC_APP_SERVICE_URL,
});
