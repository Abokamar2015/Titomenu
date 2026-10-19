export type DashboardOrder = {
  id: string;
  branchId: string | null;
  createdAt: string;
  status: string;
  payment: string;
  service: string;
  totalMinor: number;
  cardPaidMinor: number | null;
  discountMinor: number;
  items: {
    id: string;
    name_ar: string;
    name_en?: string;
    qty: number;
    price_minor: number;
  }[];
};
export function managerMetrics(orders: DashboardOrder[]) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour: String(hour).padStart(2, "0") + ":00",
    sales: 0,
    orders: 0,
  }));
  const products = new Map<
    string,
    { id: string; ar: string; en: string; qty: number; gross: number }
  >();
  const branches = new Map<string, { id: string; sales: number }>();
  const services = { dinein: 0, takeaway: 0 };
  let sales = 0,
    cash = 0,
    card = 0,
    discount = 0,
    paid = 0,
    voided = 0,
    voidValue = 0;
  for (const o of orders) {
    if (o.status === "voided") {
      voided++;
      voidValue += o.totalMinor;
      continue;
    }
    paid++;
    sales += o.totalMinor;
    discount += o.discountMinor || 0;
    const cardPart =
      o.payment === "card"
        ? o.totalMinor
        : o.payment === "mixed"
          ? o.cardPaidMinor || 0
          : 0;
    card += cardPart;
    cash += o.totalMinor - cardPart;
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone: "Asia/Riyadh",
      }).format(new Date(o.createdAt)),
    );
    hours[hour].sales += o.totalMinor / 100;
    hours[hour].orders++;
    if (o.service === "dinein") services.dinein++;
    else services.takeaway++;
    const key = o.branchId || "none",
      b = branches.get(key) || { id: key, sales: 0 };
    b.sales += o.totalMinor / 100;
    branches.set(key, b);
    for (const i of o.items) {
      const p = products.get(i.id) || {
        id: i.id,
        ar: i.name_ar,
        en: i.name_en || i.name_ar,
        qty: 0,
        gross: 0,
      };
      p.qty += i.qty;
      p.gross += (i.qty * i.price_minor) / 100;
      products.set(i.id, p);
    }
  }
  return {
    sales,
    cash,
    card,
    discount,
    paid,
    voided,
    voidValue,
    average: paid ? Math.round(sales / paid) : 0,
    hours,
    services,
    products: [...products.values()]
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 5),
    branches: [...branches.values()].sort((a, b) => b.sales - a.sales),
  };
}
