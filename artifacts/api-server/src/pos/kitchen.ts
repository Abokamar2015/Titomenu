export const kitchenStates = [
  "new",
  "preparing",
  "ready",
  "completed",
] as const;
export function canAdvanceKitchen(
  status: string,
  current: string,
  expected: string,
  next: string,
) {
  return (
    status === "paid" &&
    current === expected &&
    kitchenStates.indexOf(current as any) >= 0 &&
    kitchenStates.indexOf(next as any) ===
      kitchenStates.indexOf(current as any) + 1
  );
}
