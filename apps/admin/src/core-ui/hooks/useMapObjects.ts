import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

/**
 * One variant of a catalog row as exposed by the admin API route. The route
 * stores the three values as positionally-aligned CSV columns and zips them
 * into this structured shape on the wire.
 */
export interface MapObjectVariant {
  variant: number;
  price: number;
  freeItems: number;
}

/** Shape of a `map_objects` row as returned by the admin API route. */
export interface AdminMapObject {
  id: number;
  type: string;
  size: string;
  variants: MapObjectVariant[];
  createdAt: string;
  updatedAt: string;
}

/** Payload accepted by POST /api/admin/map-objects. */
export interface MapObjectCreatePayload {
  type: string;
  size?: string;
  variants: MapObjectVariant[];
}

/** Payload accepted by PATCH /api/admin/map-objects (id required, rest optional). */
export interface MapObjectUpdatePayload {
  id: number;
  type?: string;
  size?: string;
  variants?: MapObjectVariant[];
}

// Same-origin route handler inside this admin app — no NEXT_PUBLIC_SERVICES_URL.
const MAP_OBJECTS_URL = '/api/admin/map-objects';

// The admin secret guard lives server-side in the route handler; we still echo
// the secret header so the check passes when ADMIN_SECRET is configured.
const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** Read the full list of (non-deleted) map object catalog rows. */
export const useMapObjects = () =>
  useQuery<AdminMapObject[]>({
    queryKey: ['admin', 'map-objects'],
    queryFn: async () => {
      const response = await fetch(MAP_OBJECTS_URL, { headers: adminHeaders() });
      const data = await response.json();
      return (data?.data?.mapObjects ?? []) as AdminMapObject[];
    },
  });

const parseError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    /* ignore */
  }
  return fallback;
};

/** Create a catalog row. Throws with a readable message on failure. */
export const createMapObject = async (payload: MapObjectCreatePayload): Promise<AdminMapObject> => {
  const response = await fetch(MAP_OBJECTS_URL, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to create map object'));
  const data = await response.json();
  return data?.data?.mapObject as AdminMapObject;
};

/** Update a catalog row. Only the keys present in the payload are written. */
export const updateMapObject = async (payload: MapObjectUpdatePayload): Promise<AdminMapObject> => {
  const response = await fetch(MAP_OBJECTS_URL, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to update map object'));
  const data = await response.json();
  return data?.data?.mapObject as AdminMapObject;
};

/** Soft-delete a catalog row by id (removes it from the user-facing catalog). */
export const deleteMapObject = async (id: number): Promise<void> => {
  const response = await fetch(`${MAP_OBJECTS_URL}?id=${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to delete map object'));
};
