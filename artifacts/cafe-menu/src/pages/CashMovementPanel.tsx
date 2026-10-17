import { useEffect, useRef, useState } from "react";
import type { PosShift } from "./ShiftPanel";
type Movement = {
  id: string;
  kind: string;
  amountMinor: number;
  reason: string;
  reversesId: string | null;
  createdAt: string;
  userName: string;
  reversed: boolean;
};
export default function CashMovementPanel({
  lang,
  shift,
  api,
  onChange,
  money,
  toMinor,
  busy,
  onBusy,
}: {
  lang: "ar" | "en";
  shift: PosShift;
  api: (path: string, data?: unknown) => Promise<any>;
  onChange: () => Promise<void>;
  money: (n: number) => string;
  toMinor: (s: string) => number;
  busy: boolean;
  onBusy: (x: boolean) => void;
}) {
  const [rows, S] = useState<Movement[]>([]),
    [loading, L] = useState(true),
    [error, E] = useState(""),
    [kind, K] = useState("in"),
    [amount, A] = useState(""),
    [reason, N] = useState(""),
    [truncated, U] = useState(false);
  const inFlight = useRef(false),
    request = useRef<string | null>(null),
    reverseRequests = useRef<Record<string, string>>({});
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en),
    locale = lang === "ar" ? "ar-SA" : "en-SA";
  const label = (m: Movement) =>
    m.reversesId
      ? text("تصحيح بعكس حركة", "Reversal")
      : m.kind === "in"
        ? text("إيداع", "Cash in")
        : m.kind === "out"
          ? text("سحب", "Cash out")
          : text("مصروف نقدي", "Cash expense");
  async function load() {
    L(true);
    try {
      const j = await api(`shifts/${shift.id}/movements`);
      S(j.rows);
      U(j.truncated);
      E("");
    } catch (e) {
      E((e as Error).message);
    } finally {
      L(false);
    }
  }
  useEffect(() => {
    void load();
  }, [shift.id]);
  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (busy || inFlight.current) return;
    const amountMinor = toMinor(amount);
    if (
      !Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0 ||
      amountMinor > 100000000 ||
      reason.trim().length < 3
    ) {
      E(
        text(
          "أدخل مبلغًا موجبًا وسببًا من 3 أحرف على الأقل",
          "Enter a positive amount and a reason of at least 3 characters",
        ),
      );
      return;
    }
    if (
      !confirm(
        text(
          "تسجيل حركة النقد؟ هذا تسجيل محاسبي فقط، ولا ينقل الأموال تلقائيًا.",
          "Record this cash movement? This records cash only and does not transfer funds automatically.",
        ),
      )
    )
      return;
    inFlight.current = true;
    onBusy(true);
    request.current ||= crypto.randomUUID();
    E("");
    try {
      await api(`shifts/${shift.id}/movements`, {
        requestId: request.current,
        kind,
        amountMinor,
        reason: reason.trim(),
      });
      A("");
      N("");
      request.current = null;
      await load();
      await onChange();
    } catch (e) {
      E((e as Error).message);
    } finally {
      inFlight.current = false;
      onBusy(false);
    }
  }
  async function reverse(m: Movement) {
    if (busy || inFlight.current) return;
    const reason = prompt(
      text(
        "سبب تصحيح الحركة (3 أحرف على الأقل). سيُحفظ الأصل وتضاف حركة عكسية بنفس المبلغ.",
        "Reason for correcting this entry (at least 3 characters). The original stays and an opposite entry is added.",
      ),
    );
    if (reason === null) return;
    if (reason.trim().length < 3 || reason.trim().length > 500) {
      E(
        text(
          "أدخل سببًا من 3 إلى 500 حرف",
          "Enter a reason between 3 and 500 characters",
        ),
      );
      return;
    }
    inFlight.current = true;
    onBusy(true);
    reverseRequests.current[m.id] ||= crypto.randomUUID();
    try {
      await api(`shifts/${shift.id}/movements/${m.id}/reverse`, {
        requestId: reverseRequests.current[m.id],
        reason: reason.trim(),
      });
      delete reverseRequests.current[m.id];
      await load();
      await onChange();
    } catch (e) {
      E((e as Error).message);
    } finally {
      inFlight.current = false;
      onBusy(false);
    }
  }
  function csv() {
    const headers = [
      text("النوع", "Type"),
      text("المبلغ ر.س", "Amount SAR"),
      text("السبب", "Reason"),
      text("الموظف", "Staff"),
      text("التاريخ", "Time"),
      text("الحركة الأصلية", "Original movement"),
      text("تم عكسها", "Reversed"),
    ];
    const data = rows.map((m) => [
      label(m),
      (m.amountMinor / 100).toFixed(2),
      m.reason,
      m.userName,
      new Date(m.createdAt).toLocaleString(locale, { timeZone: "Asia/Riyadh" }),
      m.reversesId || "",
      m.reversed ? text("نعم", "Yes") : "",
    ]);
    const url = URL.createObjectURL(
      new Blob(
        [
          "\ufeff" +
            [headers, ...data]
              .map((r) =>
                r
                  .map(
                    (v) =>
                      '"' +
                      (/^[=+@\-\t\r\n]/.test(v) ? "'" + v : v).replaceAll(
                        '"',
                        '""',
                      ) +
                      '"',
                  )
                  .join(","),
              )
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `TITO-cash-${shift.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="tito-cash-movements">
      <div className="tito-toolbar">
        <h2>{text("حركة الصندوق", "Cash drawer movements")}</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void load();
            void onChange();
          }}
        >
          {text("تحديث", "Refresh")}
        </button>
        <button type="button" disabled={!rows.length || loading} onClick={csv}>
          {text("تصدير CSV", "Export CSV")}
        </button>
      </div>
      {!shift.closedAt && (
        <form className="tito-movement-form tito-no-print" onSubmit={record}>
          <label>
            {text("نوع الحركة", "Movement type")}
            <select
              value={kind}
              disabled={busy}
              onChange={(e) => {
                K(e.target.value);
                request.current = null;
              }}
            >
              <option value="in">{text("إيداع نقدي", "Cash in")}</option>
              <option value="out">{text("سحب نقدي", "Cash out")}</option>
              <option value="expense">
                {text("مصروف نقدي", "Cash expense")}
              </option>
            </select>
          </label>
          <label>
            {text("المبلغ (ر.س)", "Amount (SAR)")}
            <input
              required
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(e) => {
                A(e.target.value);
                request.current = null;
              }}
              placeholder="0.00"
            />
          </label>
          <label>
            {text("السبب", "Reason")}
            <input
              required
              minLength={3}
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(e) => {
                N(e.target.value);
                request.current = null;
              }}
            />
          </label>
          <button className="tito-primary" disabled={busy || loading}>
            {text("تسجيل الحركة", "Record movement")}
          </button>
        </form>
      )}
      {error && (
        <p className="tito-error" role="alert">
          {error}
        </p>
      )}
      <p>
        {text(
          "الحركات ليست مبيعات ولا تنفذ تحويلات مالية. التصحيح يحتفظ بالأصل ويضيف حركة عكسية؛ لا يمكن تعديل وردية مغلقة.",
          "Movements are not sales and do not transfer money. Corrections keep the original and add an opposite entry; closed shifts cannot be changed.",
        )}
      </p>
      {truncated && (
        <p className="tito-status-void">
          {text(
            "السجل والتصدير يعرضان أحدث 100 حركة فقط؛ تسوية الوردية تشمل جميع الحركات.",
            "Log and export show the latest 100 entries; shift totals include all movements.",
          )}
        </p>
      )}
      <div className="tito-table">
        <table>
          <thead>
            <tr>
              {[
                text("النوع", "Type"),
                text("المبلغ", "Amount"),
                text("السبب", "Reason"),
                text("الموظف", "Staff"),
                text("الوقت", "Time"),
                text("التصحيح", "Correction"),
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  {label(m)}
                  {m.reversed && (
                    <small className="tito-status-void">
                      {text("تم عكسها", "Reversed")}
                    </small>
                  )}
                </td>
                <td>
                  {m.kind === "in" ? "+" : "−"}
                  {money(m.amountMinor)}
                </td>
                <td className="tito-cash-reason">
                  {m.reason}
                  {m.reversesId && <small>#{m.reversesId.slice(0, 8)}</small>}
                </td>
                <td>{m.userName}</td>
                <td>
                  {new Date(m.createdAt).toLocaleString(locale, {
                    timeZone: "Asia/Riyadh",
                  })}
                </td>
                <td>
                  {!shift.closedAt && !m.reversed && !m.reversesId && (
                    <button
                      disabled={busy}
                      type="button"
                      onClick={() => void reverse(m)}
                    >
                      {text("عكس الحركة", "Reverse")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <p>{text("جارٍ التحميل…", "Loading…")}</p>
        ) : (
          !rows.length && (
            <p>{text("لا توجد حركات نقدية", "No cash movements")}</p>
          )
        )}
      </div>
    </div>
  );
}
