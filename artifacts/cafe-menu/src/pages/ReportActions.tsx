import { dailySales } from "./dailySales";
type Product = {
  id: string;
  nameAr: string;
  nameEn?: string;
  qty: number;
  valueMinor: number;
};
export default function ReportActions({
  orders,
  products,
  lang,
  from,
  to,
  branch,
  truncated,
}: {
  orders: Parameters<typeof dailySales>[0];
  products: Product[];
  lang: string;
  from: string;
  to: string;
  branch: string;
  truncated: boolean;
}) {
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const money = (n: number) => (n / 100).toFixed(2);
  const title = text("تقرير المبيعات", "Sales report");
  const scope = [
    `${from} → ${to}`,
    branch,
    text("بتوقيت الرياض · ريال سعودي", "Riyadh time · SAR"),
  ];
  const warning = truncated
    ? text(
        "نتائج جزئية: أحدث 1000 طلب فقط",
        "Partial results: latest 1,000 orders only",
      )
    : "";
  const productRows = products.map((p) => [
    lang === "ar" ? p.nameAr : p.nameEn || p.nameAr,
    String(p.qty),
    money(p.valueMinor),
  ]);
  const productHeaders = [
    text("الصنف", "Product"),
    text("الكمية", "Quantity"),
    text("القيمة قبل خصم الطلب ر.س", "Value before order discounts SAR"),
  ];
  function exportProducts() {
    const data = [
      [title],
      ...scope.map((s) => [s]),
      ...(warning ? [[warning]] : []),
      [
        text(
          "أكثر 20 صنفًا حسب الكمية؛ الملغى مستبعد",
          "Top 20 by quantity; voids excluded",
        ),
      ],
      productHeaders,
      ...productRows,
    ];
    const csv =
      "\ufeff" +
      data
        .map((r) =>
          r
            .map(
              (v) =>
                '"' +
                (/^[\s]*[=+@\-]/.test(v) ? "'" : "") +
                v.replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `TITO-Top-Products-${from}-${to}${truncated ? "-PARTIAL" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function printReport() {
    const popup = window.open("", "_blank", "width=1050,height=800");
    if (!popup) {
      alert(
        text(
          "اسمح بالنوافذ المنبثقة لطباعة التقرير",
          "Allow pop-ups to print the report",
        ),
      );
      return;
    }
    const d = popup.document;
    d.title = title;
    d.documentElement.lang = lang;
    d.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    const style = d.createElement("style");
    style.textContent =
      "body{font:14px Arial,sans-serif;margin:28px;color:#111}table{width:100%;border-collapse:collapse;margin:16px 0 24px}th,td{border:1px solid #bbb;padding:8px;text-align:start}thead{display:table-header-group}tr{break-inside:avoid}h2{margin-top:28px}button{padding:12px}@media print{button{display:none}@page{size:A4 landscape;margin:12mm}}";
    d.head.append(style);
    const add = (tag: string, value: string) => {
      const e = d.createElement(tag);
      e.textContent = value;
      d.body.append(e);
      return e;
    };
    add("h1", title);
    scope.forEach((s) => add("p", s));
    if (warning) add("strong", warning);
    add(
      "p",
      text(
        "ملخص تشغيلي غير ضريبي. الملغى مستبعد من المبيعات؛ حركات الصندوق ليست مبيعات.",
        "Non-tax operational summary. Voids and drawer movements are excluded from sales.",
      ),
    );
    function table(headers: string[], rows: string[][]) {
      const t = d.createElement("table"),
        head = d.createElement("thead"),
        body = d.createElement("tbody");
      const render = (values: string[], tag: string) => {
        const r = d.createElement("tr");
        values.forEach((v) => {
          const c = d.createElement(tag);
          c.textContent = v;
          r.append(c);
        });
        return r;
      };
      head.append(render(headers, "th"));
      rows.forEach((r) => body.append(render(r, "td")));
      t.append(head, body);
      d.body.append(t);
    }
    add("h2", text("المبيعات اليومية", "Daily sales"));
    const days = dailySales(orders);
    table(
      [
        text("التاريخ", "Date"),
        text("مدفوع", "Paid"),
        text("ملغى", "Voided"),
        text("الصافي", "Net sales"),
        text("نقدي", "Cash"),
        text("بطاقة", "Card"),
        text("خصومات", "Discounts"),
      ],
      days.map((r) => [
        r.date,
        String(r.count),
        String(r.voided),
        ...[r.total, r.cash, r.card, r.discount].map(money),
      ]),
    );
    const totals = days.reduce(
      (s, r) => ({
        total: s.total + r.total,
        cash: s.cash + r.cash,
        card: s.card + r.card,
        count: s.count + r.count,
      }),
      { total: 0, cash: 0, card: 0, count: 0 },
    );
    add(
      "p",
      `${text("الإجمالي", "Total")}: ${money(totals.total)} SAR · ${text("نقدي", "Cash")}: ${money(totals.cash)} · ${text("بطاقة", "Card")}: ${money(totals.card)} · ${text("طلبات مدفوعة", "Paid orders")}: ${totals.count}`,
    );
    add("h2", text("أكثر 20 صنفًا مبيعًا", "Top 20 products"));
    table(productHeaders, productRows);
    const print = add("button", text("طباعة / حفظ PDF", "Print / Save PDF"));
    print.onclick = () => popup.print();
    popup.focus();
  }
  return (
    <div className="tito-toolbar">
      <button onClick={printReport} disabled={!orders.length}>
        {text("طباعة تقرير المبيعات / PDF", "Print sales report / PDF")}
      </button>
      <button onClick={exportProducts} disabled={!products.length}>
        {text("تصدير الأكثر مبيعًا CSV", "Export best sellers CSV")}
      </button>
    </div>
  );
}
