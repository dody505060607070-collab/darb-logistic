/** Where an alert opens: the record's own page, so a click shows the full details. */
export type AlertTarget =
  | { to: '/repair-center'; search: { order: string } }
  | { to: '/incidents'; search: { id: string } }
  | { to: '/fleet/$id'; params: { id: string } }
  | { to: '/drivers/$id'; params: { id: string } }
  | { to: '/trips/$id'; params: { id: string } }
  | { to: '/customer-requests' }
  | { to: '/documents' }
  | { to: '/maintenance' };

export function alertLink(type: string | null | undefined, id: string | null | undefined): AlertTarget | null {
  switch (type) {
    case 'work_orders': return id ? { to: '/repair-center', search: { order: id } } : null;
    case 'incident': return id ? { to: '/incidents', search: { id } } : null;
    case 'asset': return id ? { to: '/fleet/$id', params: { id } } : null;
    case 'driver': return id ? { to: '/drivers/$id', params: { id } } : null;
    case 'trip': return id ? { to: '/trips/$id', params: { id } } : null;
    case 'customer_request': return { to: '/customer-requests' };
    case 'documents': return { to: '/documents' };
    case 'parts': return { to: '/maintenance' };
    default: return null;
  }
}
