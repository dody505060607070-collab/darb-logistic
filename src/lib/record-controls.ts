// Financial documents and immutable histories must retain their workflow controls.
export const DELETABLE_ENTITY_TABLES = new Set(['branches', 'customers', 'locations', 'contracts', 'carriers', 'assets', 'drivers', 'documents', 'authorizations', 'maintenance_plans', 'parts', 'tires', 'incidents']);
export function canDeleteEntity(table: string, owner: boolean, id: unknown) {
  return owner && typeof id === 'string' && id.length > 0 && DELETABLE_ENTITY_TABLES.has(table);
}