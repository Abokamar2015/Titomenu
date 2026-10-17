export function canManageProducts(role: string | null, superAdmin = false) {
  return superAdmin || role === "owner" || role === "manager";
}
export function canVoidOrder(
  access: { restaurantId: string; userId: string; manager: boolean },
  order: { restaurantId: string; createdBy: string | null },
) {
  return (
    access.restaurantId === order.restaurantId &&
    (access.manager || order.createdBy === access.userId)
  );
}
