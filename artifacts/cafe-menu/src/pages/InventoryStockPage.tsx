import { useEffect, useRef, useState } from "react";
import { Menu, Globe, RefreshCw, Download } from "lucide-react";
import {
  isAuthenticated,
  getCurrentRestaurantId,
  getCurrentUser,
  getCurrentMembership,
  getAuthToken,
} from "@/lib/supabase";
import { LoginScreen } from "./AdminPage";
import ManagerSidebar from "./ManagerSidebar";
import "./manager-dashboard.css";
import "./inventory.css";
type Row = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  unit: string;
  isActive: boolean;
  minimumQuantity: string;
  quantityMilli: number;
  balanceVersion: number;
  updatedAt: string | null;
};
type Movement = {
  transferId?: string | null;
  id: string;
  kind: string;
  inputQuantityMilli: number;
  deltaMilli: number;
  beforeMilli: number;
  afterMilli: number;
  unit: string;
  reason: string;
  createdAt: string;
  userName: string;
};
export default function InventoryStockPage() {
  const [, render] = useState(0);
  if (!isAuthenticated())
    return <LoginScreen onLogin={() => render((v) => v + 1)} />;
  if (!getCurrentRestaurantId())
    return (
      <div className="iv-denied" dir="rtl">
        اختر المطعم من <a href="/dashboard">مساحة العمل</a>
      </div>
    );
  if (
    !getCurrentUser()?.is_super_admin &&
    !["owner", "manager"].includes(getCurrentMembership()?.role || "")
  )
    return (
      <div className="iv-denied" dir="rtl">
        هذا القسم للمدير فقط. <a href="/pos">الكاشير</a>
      </div>
    );
  return <StockManager key={getCurrentRestaurantId()} />;
}
function StockManager() {
  const [lang, setLang] = useState<"ar" | "en">("ar"),
    [mobile, setMobile] = useState(false),
    [branches, setBranches] = useState<
      { id: string; nameAr: string; nameEn: string }[]
    >([]),
    [branch, setBranch] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [form, setForm] = useState<{
      row: Row;
      kind: string;
      destination: string;
      quantity: string;
      reason: string;
      id: string;
    } | null>(null),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  const [history, setHistory] = useState<{
      row: Row;
      rows: Movement[];
      truncated: boolean;
    } | null>(null),
    [historyBusy, setHistoryBusy] = useState(false),
    [historyError, setHistoryError] = useState("");
  const flight = useRef(false),
    historyVersion = useRef(0),
    rid = getCurrentRestaurantId(),
    text = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const quantity = (n: number) =>
    (n / 1000).toFixed(3).replace(/\.?0+$/, "") || "0";
  const locationName = branch
    ? (lang === "en"
        ? branches.find((b) => b.id === branch)?.nameEn
        : undefined) ||
      branches.find((b) => b.id === branch)?.nameAr ||
      branch
    : text("بدون فرع", "No branch");
  const kindLabel = (s: string) =>
    ({
      transfer: text("تحويل مباشر بين المواقع", "Direct location transfer"),
      receipt: text("استلام", "Receipt"),
      issue: text("صرف", "Issue"),
      waste: text("إتلاف", "Waste"),
      count: text("جرد فعلي", "Physical count"),
    })[s] || s;
  const transferTargets = [
    { key: "none", name: text("بدون فرع", "No branch") },
    ...branches.map((b) => ({
      key: b.id,
      name: lang === "en" ? b.nameEn || b.nameAr : b.nameAr,
    })),
  ].filter((b) => b.key !== (branch || "none"));
  const movementLabel = (m: Movement) =>
    m.transferId
      ? m.kind === "issue"
        ? text("تحويل صادر", "Transfer out")
        : text("تحويل وارد", "Transfer in")
      : kindLabel(m.kind);
  const unitLabel = (u: string) =>
    ({
      g: text("جرام", "Gram"),
      kg: text("كيلوجرام", "Kilogram"),
      ml: text("ملليلتر", "Milliliter"),
      l: text("لتر", "Liter"),
      pcs: text("قطعة", "Piece"),
      pack: text("عبوة", "Pack"),
    })[u] || u;
  const date = (v: string) =>
    new Date(v).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB", {
      timeZone: "Asia/Riyadh",
    });
  async function api(path: string, body?: unknown, signal?: AbortSignal) {
    const r = await fetch(`/api/restaurants/${rid}/pos/${path}`, {
      signal,
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = await r.json();
    if (!r.ok)
      throw Error(
        j.error || text("تعذر إكمال العملية", "Could not complete action"),
      );
    return j;
  }
  useEffect(() => {
    let stopped = false;
    const c = new AbortController();
    api("catalog", undefined, c.signal)
      .then((j) => {
        if (!stopped) setBranches(j.branches);
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
      c.abort();
    };
  }, [rid]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let stop = false;
    const c = new AbortController();
    setLoading(true);
    setError("");
    api(
      `inventory/stock?search=${encodeURIComponent(query)}&offset=${offset}${branch ? "&branchId=" + branch : ""}`,
      undefined,
      c.signal,
    )
      .then((j) => {
        if (!stop) {
          setRows(j.rows);
          setTotal(j.total);
          if (offset > 0 && offset >= j.total)
            setOffset(Math.max(0, Math.floor((j.total - 1) / 50) * 50));
        }
      })
      .catch((e) => {
        if (!stop) {
          setRows([]);
          setTotal(0);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
      c.abort();
    };
  }, [rid, branch, query, offset, refresh]);
  function close() {
    if (saving) return;
    if (
      form &&
      (form.reason || form.quantity) &&
      !confirm(
        text("تجاهل الحركة غير المحفوظة؟", "Discard the unsaved movement?"),
      )
    )
      return;
    setForm(null);
  }
  useEffect(() => {
    const handle = (e: BeforeUnloadEvent) => {
      if (form) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [!!form]);
  useEffect(() => {
    if (!form && !history) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (history) {
          historyVersion.current++;
          setHistory(null);
        } else close();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          document
            .querySelector(".iv-overlay")
            ?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
            ) || [],
        );
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes[nodes.length - 1]?.focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === nodes[nodes.length - 1]
        ) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [!!form, !!history, saving, form?.reason, form?.quantity]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || flight.current) return;
    setFormError("");
    const q = form.quantity
      .trim()
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
      .replace(/[٫,]/g, ".");
    if (
      !/^\d{1,7}(\.\d{1,3})?$/.test(q) ||
      Number(q) > 1000000 ||
      (form.kind !== "count" && Number(q) === 0)
    ) {
      setFormError(
        text(
          "أدخل كمية موجبة حتى 3 منازل، أو صفرًا للجرد، بحد مليون وحدة.",
          "Enter a positive quantity up to 3 decimals, or zero for counts, with a maximum of one million units.",
        ),
      );
      return;
    }
    if (
      form.kind === "transfer" &&
      (!form.destination || form.destination === (branch || "none"))
    ) {
      setFormError(
        text(
          "اختر موقع وجهة مختلفًا عن المصدر",
          "Choose a destination different from the source",
        ),
      );
      return;
    }
    if (
      !confirm(
        text(
          form.kind === "transfer"
            ? `تأكيد تحويل ${q} ${unitLabel(form.row.unit)} من ${locationName} إلى ${transferTargets.find((t) => t.key === form.destination)?.name}؟ يُسجل الاستلام فورًا.`
            : "تأكيد تسجيل الحركة الفعلية؟ ستُحفظ في السجل ولا تُحذف.",
          form.kind === "transfer"
            ? `Transfer ${q} ${unitLabel(form.row.unit)} from ${locationName} to ${transferTargets.find((t) => t.key === form.destination)?.name}? Receipt is recorded immediately.`
            : "Record this physical movement? It will remain in the audit ledger.",
        ),
      )
    )
      return;
    flight.current = true;
    setSaving(true);
    try {
      if (form.kind === "transfer")
        await api("inventory/stock/transfers", {
          id: form.id,
          itemId: form.row.id,
          fromBranchId: branch || null,
          toBranchId: form.destination === "none" ? null : form.destination,
          quantity: q,
          reason: form.reason,
          expectedVersion: form.row.balanceVersion,
          expectedUnit: form.row.unit,
        });
      else
        await api("inventory/stock/movements", {
          id: form.id,
          itemId: form.row.id,
          branchId: branch || null,
          kind: form.kind,
          quantity: q,
          reason: form.reason,
          expectedVersion: form.row.balanceVersion,
          expectedUnit: form.row.unit,
        });
      setForm(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
      flight.current = false;
    }
  }
  async function showHistory(row: Row) {
    const version = ++historyVersion.current;
    setHistory({ row, rows: [], truncated: false });
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const j = await api(
        `inventory/stock/${row.id}/movements${branch ? "?branchId=" + branch : ""}`,
      );
      if (version === historyVersion.current)
        setHistory({ row, rows: j.rows, truncated: j.truncated });
    } catch (e) {
      if (version === historyVersion.current)
        setHistoryError((e as Error).message);
    } finally {
      if (version === historyVersion.current) setHistoryBusy(false);
    }
  }
  function download(data: string[][], name: string) {
    const content =
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
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportStock() {
    download(
      [
        [text("الفرع", "Location"), locationName],
        [
          text("الكود", "Code"),
          text("المادة", "Item"),
          text("الوحدة", "Unit"),
          text("الرصيد", "Balance"),
          text("حد الطلب", "Reorder level"),
          text("رصيد مهيأ بحركة", "Balance initialized by movement"),
        ],
        ...rows.map((r) => [
          r.code,
          lang === "ar" ? r.nameAr : r.nameEn || r.nameAr,
          r.unit,
          quantity(r.quantityMilli),
          r.minimumQuantity,
          r.balanceVersion > 0 ? "1" : "0",
        ]),
      ],
      `TITO-stock-page-${offset / 50 + 1}.csv`,
    );
  }
  function exportHistory() {
    if (!history) return;
    download(
      [
        [text("الفرع", "Location"), locationName],
        [text("المادة", "Item"), history.row.code],
        [
          text("نطاق التصدير", "Export scope"),
          text("أحدث 50 حركة فقط", "Latest 50 movements only"),
        ],
        [
          text("التاريخ", "Date"),
          text("النوع", "Type"),
          text("قبل", "Before"),
          text("التغير", "Change"),
          text("بعد", "After"),
          text("الوحدة", "Unit"),
          text("السبب", "Reason"),
          text("الموظف", "User"),
          text("مرجع التحويل", "Transfer reference"),
        ],
        ...history.rows.map((m) => [
          date(m.createdAt),
          movementLabel(m),
          quantity(m.beforeMilli),
          quantity(m.deltaMilli),
          quantity(m.afterMilli),
          m.unit,
          m.reason,
          m.userName,
          m.transferId || "",
        ]),
      ],
      `TITO-stock-ledger-${history.row.code}.csv`,
    );
  }
  return (
    <div className="md-shell" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <ManagerSidebar lang={lang} active="stock" mobile={mobile} />
      <main className="md-main">
        <header className="md-topbar">
          <button
            className="md-mobile"
            aria-label={text("القائمة", "Menu")}
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <span>
            {text(
              "المخزون / الأرصدة والحركات",
              "Inventory / Balances & movements",
            )}
          </span>
          <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            <Globe size={16} />
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </header>
        <div className="md-content">
          <div className="md-heading">
            <div>
              <p>TITO · STOCK CONTROL</p>
              <h1>
                {text("أرصدة وحركات المخزون", "Stock balances & movements")}
              </h1>
              <span>
                {text(
                  "استلام وصرف وإتلاف وجرد مع سجل لكل حركة",
                  "Receipts, issues, waste and counts with an audit ledger",
                )}
              </span>
            </div>
            <a className="md-primary" href="/inventory/items">
              {text("تعريف المواد", "Item catalog")}
            </a>
          </div>
          <p className="iv-notice">
            {text(
              "الأرصدة حسب الموقع المختار وتبدأ من صفر حتى تسجيل الحركات. الجرد يضبط الرصيد إلى الكمية الفعلية المعدودة؛ لا يضيفها. لا يوجد خصم من البيع أو تحويل تلقائي للوحدات أو فاتورة شراء هنا.",
              "Balances are specific to the selected location and start at zero until movements are recorded. Counts set the balance to the counted quantity; they do not add it. POS deduction, unit conversion and purchase invoices are not connected.",
            )}
          </p>
          <section className="md-card iv-list">
            <div className="iv-list-toolbar">
              <label className="iv-stock-location">
                {text("الموقع", "Location")}
                <select
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">
                    {text(
                      "بدون فرع — رصيد مستقل",
                      "No branch — separate balance",
                    )}
                  </option>
                  {branches.map((b) => (
                    <option value={b.id} key={b.id}>
                      {lang === "en" ? b.nameEn || b.nameAr : b.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={loading || !rows.length || search.trim() !== query}
                onClick={exportStock}
              >
                <Download size={16} />
                {text("تصدير الصفحة CSV", "Export page CSV")}
              </button>
            </div>
            <div className="iv-search">
              <label>
                <input
                  type="search"
                  maxLength={150}
                  placeholder={text(
                    "ابحث باسم المادة أو الكود…",
                    "Search item name or code…",
                  )}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                disabled={loading}
                onClick={() => setRefresh((n) => n + 1)}
              >
                <RefreshCw size={16} />
                {text("تحديث الرصيد", "Refresh balance")}
              </button>
            </div>
            {error && (
              <p className="md-error" role="alert">
                {error}
              </p>
            )}
            {loading ? (
              <p className="md-loading">{text("جارٍ التحميل…", "Loading…")}</p>
            ) : (
              <div className="iv-table">
                <table>
                  <thead>
                    <tr>
                      {[
                        text("المادة", "Item"),
                        text("الكود", "Code"),
                        text("الوحدة", "Unit"),
                        text("الرصيد الحالي", "On-hand balance"),
                        text("حد الطلب", "Reorder level"),
                        text("الحالة", "Status"),
                        text("إجراءات", "Actions"),
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <b>
                            {lang === "ar" ? r.nameAr : r.nameEn || r.nameAr}
                          </b>
                          {!r.isActive && (
                            <small>
                              {text("مادة مؤرشفة", "Archived item")}
                            </small>
                          )}
                        </td>
                        <td>{r.code}</td>
                        <td>{unitLabel(r.unit)}</td>
                        <td>
                          <b>{quantity(r.quantityMilli)}</b>
                        </td>
                        <td>{r.minimumQuantity}</td>
                        <td>
                          <span
                            className={
                              "iv-badge " +
                              (r.quantityMilli >
                              Math.round(Number(r.minimumQuantity) * 1000)
                                ? "is-active"
                                : "")
                            }
                          >
                            {r.balanceVersion === 0
                              ? text("لم تُسجل حركة", "No movement recorded")
                              : r.quantityMilli <=
                                  Math.round(Number(r.minimumQuantity) * 1000)
                                ? text(
                                    "عند حد الطلب أو أقل",
                                    "At or below reorder level",
                                  )
                                : text("فوق الحد", "Above reorder level")}
                          </span>
                        </td>
                        <td>
                          <button
                            disabled={!r.isActive}
                            onClick={() => {
                              setForm({
                                row: r,
                                kind: "receipt",
                                destination: "",
                                quantity: "",
                                reason: "",
                                id: crypto.randomUUID(),
                              });
                              setFormError("");
                            }}
                          >
                            {text("تسجيل حركة", "Record movement")}
                          </button>
                          <button onClick={() => showHistory(r)}>
                            {text("سجل الحركات", "Movement ledger")}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!rows.length && !error && (
                      <tr>
                        <td colSpan={7} className="iv-empty">
                          {text(
                            "لا توجد مواد. أضف المادة من تعريف المواد أولًا.",
                            "No items. Create items in the catalog first.",
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <footer className="iv-pagination">
              <span>
                {total
                  ? `${offset + 1}–${Math.min(total, offset + 50)} / ${total}`
                  : "0"}
              </span>
              <button
                disabled={loading || offset === 0}
                onClick={() => setOffset((n) => n - 50)}
              >
                {text("السابق", "Previous")}
              </button>
              <button
                disabled={loading || offset + 50 >= total}
                onClick={() => setOffset((n) => n + 50)}
              >
                {text("التالي", "Next")}
              </button>
            </footer>
          </section>
        </div>
      </main>
      {form && (
        <div
          className="iv-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={text("تسجيل حركة مخزون", "Record stock movement")}
        >
          <form className="iv-drawer" onSubmit={save}>
            <header>
              <div>
                <small>{locationName}</small>
                <h2>
                  {lang === "ar"
                    ? form.row.nameAr
                    : form.row.nameEn || form.row.nameAr}
                </h2>
                <p>
                  {text("الرصيد الحالي", "Current balance")}:{" "}
                  {quantity(form.row.quantityMilli)} {unitLabel(form.row.unit)}
                </p>
              </div>
              <button type="button" onClick={close} disabled={saving}>
                {text("إغلاق ×", "Close ×")}
              </button>
            </header>
            <fieldset disabled={saving}>
              <div className="iv-fields">
                <label>
                  {text("نوع الحركة", "Movement type")}
                  <select
                    autoFocus
                    value={form.kind}
                    onChange={(e) =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              kind: e.target.value,
                              quantity:
                                e.target.value === "count"
                                  ? quantity(f.row.quantityMilli)
                                  : "",
                            }
                          : f,
                      )
                    }
                  >
                    {[
                      "receipt",
                      "issue",
                      "waste",
                      "count",
                      ...(transferTargets.length ? ["transfer"] : []),
                    ].map((k) => (
                      <option value={k} key={k}>
                        {kindLabel(k)}
                      </option>
                    ))}
                  </select>
                </label>
                {form.kind === "transfer" && (
                  <label>
                    {text("موقع الوجهة", "Destination location")}
                    <select
                      required
                      value={form.destination}
                      onChange={(e) =>
                        setForm((f) =>
                          f ? { ...f, destination: e.target.value } : f,
                        )
                      }
                    >
                      <option value="">
                        {text("اختر الوجهة", "Choose destination")}
                      </option>
                      {transferTargets.map((t) => (
                        <option value={t.key} key={t.key}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {form.kind === "transfer" && (
                  <p className="iv-help">
                    {text(
                      "هذا تحويل مباشر يسجل الصرف والاستلام معًا. استخدمه عند وصول المواد إلى الوجهة؛ لا يتضمن حالة قيد النقل أو موافقة مستلم منفصلة. إعادة المحاولة لا تكرر التحويل.",
                      "This is an immediate transfer that records issue and receipt together. Use it when stock reaches the destination; there is no in-transit stage or separate receiving approval. Retries do not duplicate the transfer.",
                    )}
                  </p>
                )}
                <label>
                  {form.kind === "count"
                    ? text("الكمية الفعلية المعدودة", "Actual counted quantity")
                    : text("كمية الحركة", "Movement quantity")}{" "}
                  ({unitLabel(form.row.unit)})
                  <input
                    required
                    maxLength={20}
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, quantity: e.target.value } : f,
                      )
                    }
                  />
                </label>
                <p className="iv-help">
                  {form.kind === "count"
                    ? text(
                        "أدخل كامل الكمية الموجودة فعليًا في هذا الموقع. يسجل الفرق تلقائيًا، ويقبل صفرًا إذا كانت المادة نافدة.",
                        "Enter the full physically counted amount at this location. The difference is recorded automatically; zero is allowed for empty stock.",
                      )
                    : text(
                        "استعمل الوحدة الظاهرة فقط؛ لا توجد تحويلات تلقائية بين كيلوجرام وجرام أو عبوة وقطعة.",
                        "Use the displayed unit only. There is no automatic conversion between kg/g or packs/pieces.",
                      )}
                </p>
                <label className="iv-wide">
                  {text(
                    "سبب الحركة أو مرجع المستند",
                    "Reason or document reference",
                  )}
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    rows={4}
                    value={form.reason}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, reason: e.target.value } : f))
                    }
                  />
                </label>
              </div>
            </fieldset>
            {formError && (
              <p className="md-error" role="alert">
                {formError}
              </p>
            )}
            <footer>
              <button type="submit" className="md-primary" disabled={saving}>
                {saving
                  ? text("جارٍ الحفظ…", "Saving…")
                  : text("تأكيد وتسجيل الحركة", "Confirm and record")}
              </button>
              <button type="button" disabled={saving} onClick={close}>
                {text("إلغاء", "Cancel")}
              </button>
            </footer>
          </form>
        </div>
      )}
      {history && (
        <div
          className="iv-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={text("سجل الحركات", "Movement ledger")}
        >
          <section className="iv-drawer">
            <header>
              <div>
                <small>{locationName}</small>
                <h2>
                  {text("سجل الحركات", "Movement ledger")} · {history.row.code}
                </h2>
              </div>
              <button
                autoFocus
                onClick={() => {
                  historyVersion.current++;
                  setHistory(null);
                }}
              >
                {text("إغلاق ×", "Close ×")}
              </button>
            </header>
            <p className="iv-help">
              {text(
                "أحدث 50 حركة. لا تحذف الحركات؛ صحح الكمية بحركة فعلية جديدة مع السبب.",
                "Latest 50 movements. Movements cannot be deleted; correct stock with a new physical movement and reason.",
              )}
            </p>
            {history.truncated && (
              <p className="md-warning">
                {text(
                  "توجد حركات أقدم غير معروضة؛ الرصيد الحالي يشمل جميع الحركات.",
                  "Older movements are not shown; the current balance includes all movements.",
                )}
              </p>
            )}
            <button
              disabled={historyBusy || !history.rows.length}
              onClick={exportHistory}
            >
              {text("تصدير السجل المعروض CSV", "Export shown ledger CSV")}
            </button>
            {historyBusy ? (
              <p>{text("جارٍ التحميل…", "Loading…")}</p>
            ) : historyError ? (
              <p role="alert">{historyError}</p>
            ) : history.rows.length ? (
              history.rows.map((m) => (
                <article className="iv-event" key={m.id}>
                  <b>
                    {movementLabel(m)} · {quantity(m.deltaMilli)}{" "}
                    {unitLabel(m.unit)}
                  </b>
                  <p>
                    {m.userName} · {date(m.createdAt)}
                  </p>
                  {m.transferId && (
                    <p>
                      {text("مرجع التحويل", "Transfer reference")}:{" "}
                      <code title={m.transferId}>
                        {m.transferId.slice(0, 8).toUpperCase()}
                      </code>
                    </p>
                  )}
                  <p>
                    {text("قبل", "Before")}: {quantity(m.beforeMilli)} ·{" "}
                    {text("بعد", "After")}: {quantity(m.afterMilli)}
                  </p>
                  <div className="iv-stock-reason">{m.reason}</div>
                </article>
              ))
            ) : (
              <p className="iv-empty">
                {text(
                  "لا توجد حركات في هذا الموقع",
                  "No movements at this location",
                )}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
