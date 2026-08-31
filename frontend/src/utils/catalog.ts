import { apiFetch, API } from './apiFetch';

// The assignable factory/stone-supplier list used to be two fixed enums —
// now backed by CatalogItem rows in the database (see backend catalog module)
// so Admin can grow it from Settings without a code change.
export interface CatalogOption {
  key: string;
  label: string;
}

export const fetchFactoryOptions = (): Promise<CatalogOption[]> =>
  apiFetch(`${API}/catalog/factories`).then(r => r.ok ? r.json() : []).catch(() => []);

export const fetchSupplySourceOptions = (): Promise<CatalogOption[]> =>
  apiFetch(`${API}/catalog/supply-sources`).then(r => r.ok ? r.json() : []).catch(() => []);

export const addFactoryOption = (label: string): Promise<Response> =>
  apiFetch(`${API}/catalog/factories`, { method: 'POST', body: JSON.stringify({ label }) });

export const addSupplySourceOption = (label: string): Promise<Response> =>
  apiFetch(`${API}/catalog/supply-sources`, { method: 'POST', body: JSON.stringify({ label }) });
