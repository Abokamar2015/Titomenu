export function reportPeriod(
  today: string,
  kind: "today" | "yesterday" | "week" | "month",
) {
  const offset = (days: number) =>
    new Date(Date.parse(today + "T12:00:00Z") + days * 86400000)
      .toISOString()
      .slice(0, 10);
  if (kind === "yesterday") return { from: offset(-1), to: offset(-1) };
  return {
    from:
      kind === "week"
        ? offset(-6)
        : kind === "month"
          ? today.slice(0, 8) + "01"
          : today,
    to: today,
  };
}
