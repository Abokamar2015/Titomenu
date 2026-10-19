import { dailySales } from "./dailySales";
export default function DailySalesReport({
  orders,
  lang,
  money,
  from,
  to,
  truncated,
}: {
  orders: Parameters<typeof dailySales>[0];
  lang: string;
  money: (n: number) => string;
  from: string;
  to: string;
  truncated: boolean;
}) {
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const rows = dailySales(orders);
  const labels = [
    text("التاريخ", "Date"),
    text("الطلبات المدفوعة", "Paid orders"),
    text("الملغاة", "Voided orders"),
    text("صافي المبيعات ر.س", "Net sales SAR"),
    text("نقدي ر.س", "Cash SAR"),
    text("بطاقة ر.س", "Card SAR"),
    text("الخصومات ر.س", "Discounts SAR"),
  ];
  function exportCsv() {
    const data = [
      labels,
      ...rows.map((r) => [
        r.date,
        r.count,
        r.voided,
        ...[r.total, r.cash, r.card, r.discount].map((v) =>
          (v / 100).toFixed(2),
        ),
      ]),
    ];
    const content =
      "\ufeff" +
      data
        .map((r) =>
          r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `TITO-Daily-${from}-${to}${truncated ? "-PARTIAL" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section>
      <div className="tito-toolbar">
        <h2>{text("المبيعات حسب اليوم", "Sales by day")}</h2>
        <button onClick={exportCsv} disabled={!rows.length}>
          {text("تصدير الملخص اليومي CSV", "Export daily summary CSV")}
        </button>
      </div>
      <p>
        {text(
          "بتوقيت الرياض؛ النقد المستلم والباقي وحركات الصندوق لا تدخل في المبيعات.",
          "Riyadh time; tendered cash, change and drawer movements are excluded from sales.",
        )}
      </p>
      {truncated && (
        <p className="tito-error">
          {text(
            "ملخص جزئي لأحدث 1000 طلب فقط؛ اختصر الفترة.",
            "Partial summary of the latest 1,000 orders only; shorten the period.",
          )}
        </p>
      )}
      <div className="tito-table">
        <table>
          <thead>
            <tr>
              {labels.map((l) => (
                <th key={l}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{r.count}</td>
                <td>{r.voided}</td>
                {[r.total, r.cash, r.card, r.discount].map((v, i) => (
                  <td key={i}>{money(v)}</td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7}>
                  {text("لا توجد طلبات في الفترة", "No orders in this period")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
