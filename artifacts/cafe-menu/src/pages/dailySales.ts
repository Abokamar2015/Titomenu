type Sale = {
  createdAt: string;
  status: string;
  payment: string;
  totalMinor: number;
  cardPaidMinor: number | null;
  discountMinor: number;
};
export function dailySales(orders: Sale[]) {
  const days = new Map<
    string,
    {
      date: string;
      count: number;
      voided: number;
      total: number;
      cash: number;
      card: number;
      discount: number;
    }
  >();
  for (const o of orders) {
    const date = new Date(new Date(o.createdAt).getTime() + 3 * 3600000)
      .toISOString()
      .slice(0, 10);
    const row = days.get(date) || {
      date,
      count: 0,
      voided: 0,
      total: 0,
      cash: 0,
      card: 0,
      discount: 0,
    };
    if (o.status === "voided") row.voided++;
    else {
      const card =
        o.payment === "card"
          ? o.totalMinor
          : o.payment === "mixed"
            ? o.cardPaidMinor || 0
            : 0;
      row.count++;
      row.total += o.totalMinor;
      row.card += card;
      row.cash += o.totalMinor - card;
      row.discount += o.discountMinor || 0;
    }
    days.set(date, row);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
