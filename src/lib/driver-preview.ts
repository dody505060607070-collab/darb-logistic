/** Presentation only; actual access remains enforced by role-checked RPCs. */
export function driverScreenMode(superAdmin: boolean, driverId: string | null, viewAs: string | null) {
  const preview = superAdmin && (!driverId || viewAs === 'driver');
  return { preview, blocked: !driverId && !preview };
}