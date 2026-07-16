/** Shared client configuration from Vite environment variables. */

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const DEFAULT_LOCATION = {
  lat: Number(import.meta.env.VITE_DEFAULT_LAT),
  lon: Number(import.meta.env.VITE_DEFAULT_LON),
};
