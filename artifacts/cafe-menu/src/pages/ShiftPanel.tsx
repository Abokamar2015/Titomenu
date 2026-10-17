import { useState } from "react";
export type ShiftSummary = {
  salesMinor: number;
  cashMinor: number;
  cardMinor: number;
  discountMinor: number;
  paidCount: number;
  voidedCount: number;
  expectedMinor: number;
};
export type PosShift = {
  id: string;
  restaurantId: string;
  userId: string;
  branchId: string | null;
  openingMinor: number;
  openedAt: string;
  closedAt: string | null;
  countedMinor: number | null;
  expectedMinor: number | null;
  varianceMinor: number | null;
  closingNote: string;
  closingSummary: ShiftSummary | null;
  userName?: string;
};
export default function ShiftPanel({
  lang,
  active,
  summary,
  history,
  busy,
  loading,
  manager,
  all,
  onAll,
  onRefresh,
  onOpen,
  onClose,
  money,
  toMinor,
  branchName,
}: {
  lang: "ar" | "en";
  active: PosShift | null;
  summary: ShiftSummary | null;
  history: PosShift[];
  busy: boolean;
  loading: boolean;
  manager: boolean;
  all: boolean;
  onAll: (x: boolean) => void;
  onRefresh: () => void;
  onOpen: (amount: number) => Promise<boolean>;
  onClose: (amount: number, note: string) => Promise<boolean>;
  money: (n: number) => string;
  toMinor: (s: string) => number;
  branchName: (id: string | null) => string;
}) {
  const [opening, S] = useState(""),
    [counted, C] = useState(""),
    [note, N] = useState(""),
    [selected, R] = useState<PosShift | null>(null),
    [formError, E] = useState("");
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en),
    locale = lang === "ar" ? "ar-SA" : "en-SA";
  const date = (v: string) =>
    new Date(v).toLocaleString(locale, { timeZone: "Asia/Riyadh" });
  const countedMinor = toMinor(counted),
    expected = summary?.expectedMinor || 0,
    variance = countedMinor - expected;
  async function submitOpen(e: React.FormEvent) {
    e.preventDefault();
    const n = toMinor(opening);
    if (!opening.trim() || !Number.isFinite(n) || n < 0 || n > 100000000) {
      E(
        text(
          "أدخل رصيد بداية صحيحًا، ويمكن أن يكون صفرًا",
          "Enter a valid opening balance; zero is allowed",
        ),
      );
      return;
    }
    E("");
    if (await onOpen(n)) S("");
  }
  async function submitClose(e: React.FormEvent) {
    e.preventDefault();
    if (
      !counted.trim() ||
      !Number.isFinite(countedMinor) ||
      countedMinor < 0 ||
      countedMinor > 2000000000
    ) {
      E(text("أدخل النقد المعدود فعليًا", "Enter the cash actually counted"));
      return;
    }
    if (variance !== 0 && note.trim().length < 3) {
      E(text("أدخل تفسيرًا للفرق في الصندوق", "Explain the cash difference"));
      return;
    }
    if (
      !confirm(
        text(
          "إغلاق الوردية؟ لن يمكن تسجيل مبيعات أو إلغاء طلباتها بعدها.",
          "Close this shift? No further sales or order voids can be recorded against it.",
        ),
      )
    )
      return;
    E("");
    if (await onClose(countedMinor, note.trim())) {
      C("");
      N("");
    }
  }
  return (
    <section className="tito-shifts">
      <div className="tito-toolbar">
        <h2>{text("وردية الكاشير", "Cashier shift")}</h2>
        <button disabled={busy || loading} onClick={onRefresh}>
          {text("تحديث", "Refresh")}
        </button>
      </div>
      {loading && <p>{text("جارٍ تحميل الوردية…", "Loading shift…")}</p>}
      {!loading &&
        (!active ? (
          <form className="tito-shift-panel" onSubmit={submitOpen}>
            <h2>{text("فتح وردية جديدة", "Open a new shift")}</h2>
            <p>
              {text(
                "كل كاشير يفتح ورديته بحسابه. رصيد البداية هو النقد الموجود قبل أول بيع.",
                "Each cashier opens a shift using their own account. Opening balance is cash in the drawer before the first sale.",
              )}
            </p>
            <label>
              {text("رصيد بداية الصندوق (ر.س)", "Opening cash (SAR)")}
              <input
                required
                inputMode="decimal"
                value={opening}
                disabled={busy}
                onChange={(e) => S(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <button className="tito-primary" disabled={busy}>
              {text("فتح الوردية", "Open shift")}
            </button>
          </form>
        ) : (
          <div className="tito-shift-panel">
            <div className="tito-toolbar">
              <h2>
                {text("وردية مفتوحة", "Open shift")} · #{active.id.slice(0, 8)}
              </h2>
              <small>
                {date(active.openedAt)} · {branchName(active.branchId)}
              </small>
            </div>
            <div className="tito-stats">
              {[
                [text("رصيد البداية", "Opening cash"), active.openingMinor],
                [text("صافي المبيعات", "Net sales"), summary?.salesMinor || 0],
                [
                  text("المبيعات النقدية", "Cash sales"),
                  summary?.cashMinor || 0,
                ],
                [text("مبيعات البطاقة", "Card sales"), summary?.cardMinor || 0],
                [text("النقد المتوقع", "Expected cash"), expected],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p>{label}</p>
                  <strong>{money(Number(value))}</strong>
                </div>
              ))}
            </div>
            <p>
              {text(
                "المتوقع = رصيد البداية + المبيعات النقدية غير الملغاة، بعد استبعاد الباقي. لا يشمل سحبًا أو إيداعًا أثناء الوردية.",
                "Expected cash = opening balance + non-voided cash sales, excluding customer change. Mid-shift cash withdrawals and deposits are not included.",
              )}
            </p>
            <form className="tito-shift-close" onSubmit={submitClose}>
              <label>
                {text(
                  "النقد المعدود فعليًا (ر.س)",
                  "Actual counted cash (SAR)",
                )}
                <input
                  inputMode="decimal"
                  required
                  value={counted}
                  disabled={busy}
                  onChange={(e) => C(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              {counted.trim() && Number.isFinite(countedMinor) && (
                <p
                  className={
                    variance === 0 ? "tito-status-paid" : "tito-status-void"
                  }
                >
                  {text("فرق الصندوق: ", "Cash variance: ")}
                  {money(variance)}{" "}
                  {text("(المعدود ناقص المتوقع)", "(counted minus expected)")}
                </p>
              )}
              <label>
                {text(
                  "ملاحظة الإغلاق — إلزامية عند وجود فرق",
                  "Closing note — required if cash differs",
                )}
                <input
                  maxLength={500}
                  disabled={busy}
                  value={note}
                  onChange={(e) => N(e.target.value)}
                />
              </label>
              <button
                disabled={busy || !summary || loading}
                className="tito-primary"
              >
                {text(
                  "إغلاق الوردية وحفظ التسوية",
                  "Close shift & save reconciliation",
                )}
              </button>
            </form>
          </div>
        ))}
      {formError && (
        <p role="alert" className="tito-error">
          {formError}
        </p>
      )}
      <div className="tito-toolbar">
        <h2>{text("سجل الورديات", "Shift history")}</h2>
        {manager && (
          <label className="tito-shift-all">
            <input
              type="checkbox"
              checked={all}
              disabled={busy}
              onChange={(e) => onAll(e.target.checked)}
            />
            {text("جميع موظفي المطعم", "All restaurant staff")}
          </label>
        )}
        <small>
          {text(
            "أحدث 100 وردية · بتوقيت الرياض",
            "Latest 100 shifts · Riyadh time",
          )}
        </small>
      </div>
      <div className="tito-table">
        <table>
          <thead>
            <tr>
              {[
                text("الكاشير", "Cashier"),
                text("الفتح", "Opened"),
                text("الإغلاق", "Closed"),
                text("الفرع", "Branch"),
                text("المتوقع", "Expected"),
                text("المعدود", "Counted"),
                text("الفرق", "Variance"),
                text("التفاصيل", "Details"),
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{h.userName || h.userId.slice(0, 8)}</td>
                <td>{date(h.openedAt)}</td>
                <td>
                  {h.closedAt ? date(h.closedAt) : text("مفتوحة", "Open")}
                </td>
                <td>{branchName(h.branchId)}</td>
                <td>
                  {h.expectedMinor === null ? "—" : money(h.expectedMinor)}
                </td>
                <td>{h.countedMinor === null ? "—" : money(h.countedMinor)}</td>
                <td>
                  {h.varianceMinor === null ? "—" : money(h.varianceMinor)}
                </td>
                <td>
                  <button onClick={() => R(h)}>{text("عرض", "View")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!history.length && (
          <p className="tito-empty">
            {text("لا توجد ورديات بعد", "No shifts yet")}
          </p>
        )}
      </div>
      {selected && (
        <div className="tito-overlay">
          <section className="tito-receipt">
            <div className="tito-no-print tito-toolbar">
              <button onClick={() => R(null)}>
                {text("إغلاق ×", "Close ×")}
              </button>
              <button onClick={() => window.print()}>
                {text("طباعة التقرير", "Print report")}
              </button>
            </div>
            <h2>TITO POS</h2>
            <p>
              {text("تقرير الوردية", "Shift report")} #{selected.id.slice(0, 8)}
            </p>
            <p>
              {selected.userName} · {branchName(selected.branchId)}
            </p>
            <p>
              {date(selected.openedAt)} →{" "}
              {selected.closedAt
                ? date(selected.closedAt)
                : text("مفتوحة", "Open")}
            </p>
            {[
              [text("رصيد البداية", "Opening cash"), selected.openingMinor],
              [
                text("صافي المبيعات", "Net sales"),
                selected.closingSummary?.salesMinor,
              ],
              [
                text("النقد من المبيعات", "Cash sales"),
                selected.closingSummary?.cashMinor,
              ],
              [
                text("البطاقة", "Card sales"),
                selected.closingSummary?.cardMinor,
              ],
              [
                text("الخصومات", "Discounts"),
                selected.closingSummary?.discountMinor,
              ],
              [text("النقد المتوقع", "Expected cash"), selected.expectedMinor],
              [text("النقد المعدود", "Counted cash"), selected.countedMinor],
              [text("الفرق", "Variance"), selected.varianceMinor],
            ].map(([label, value]) => (
              <div className="tito-receipt-line" key={String(label)}>
                <span>{label}</span>
                <b>{value == null ? "—" : money(Number(value))}</b>
              </div>
            ))}
            <p>
              {text("الطلبات المدفوعة: ", "Paid orders: ")}
              {selected.closingSummary?.paidCount ?? "—"} ·{" "}
              {text("الملغاة: ", "Voided: ")}
              {selected.closingSummary?.voidedCount ?? "—"}
            </p>
            {selected.closingNote && <p>{selected.closingNote}</p>}
            <small>
              {text(
                "تقرير تسوية داخلي، وليس فاتورة ضريبية",
                "Internal reconciliation report, not a tax invoice",
              )}
            </small>
          </section>
        </div>
      )}
    </section>
  );
}
