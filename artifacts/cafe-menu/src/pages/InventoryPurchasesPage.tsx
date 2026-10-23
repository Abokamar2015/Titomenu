import { useEffect, useRef, useState } from "react";
import { Menu, Globe, Plus, RefreshCw, Download } from "lucide-react";
import {
  isAuthenticated,
  getAuthToken,
  getCurrentUser,
  getCurrentMembership,
  getCurrentRestaurantId,
} from "@/lib/supabase";
import { LoginScreen } from "./AdminPage";
import ManagerSidebar from "./ManagerSidebar";
import "./manager-dashboard.css";
import "./inventory.css";
type Material = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  unit: string;
  referenceCostMinor: number;
};
type PurchaseLine = {
  itemId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  unit: string;
  quantityMilli: number;
  unitCostMinor: number;
  lineTotalMinor: number;
};
type Document = {
  id: string;
  reference: string;
  supplierName: string;
  supplierCode: string;
  branchId: string | null;
  documentDate: string;
  totalMinor: number;
  status: string;
  createdAt: string;
  items: PurchaseLine[];
  notes: string;
  cancellationReason: string | null;
  cancelledAt: string | null;
};
type EditLine = { item: Material; quantity: string; cost: string };
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function InventoryPurchasesPage() {
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
  return <Purchases key={getCurrentRestaurantId()} />;
}
function Purchases() {
  const [lang, setLang] = useState<"ar" | "en">("ar"),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [rows, setRows] = useState<Document[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [branches, setBranches] = useState<
      { id: string; nameAr: string; nameEn: string }[]
    >([]),
    [form, setForm] = useState<{
      id: string;
      supplierId: string;
      supplierLabel: string;
      branchId: string;
      reference: string;
      date: string;
      notes: string;
      lines: EditLine[];
    } | null>(null),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  const [supplierSearch, setSupplierSearch] = useState(""),
    [itemSearch, setItemSearch] = useState(""),
    [suppliers, setSuppliers] = useState<
      { id: string; nameAr: string; code: string }[]
    >([]),
    [materials, setMaterials] = useState<Material[]>([]),
    [pickError, setPickError] = useState("");
  const [detail, setDetail] = useState<Document | null>(null),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState("");
  const flight = useRef(false),
    detailVersion = useRef(0),
    rid = getCurrentRestaurantId(),
    text = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const money = (v: number) => (v / 100).toFixed(2),
    qty = (v: number) => (v / 1000).toFixed(3),
    normal = (v: string) =>
      v
        .trim()
        .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
        .replace(/[٫,]/g, ".");
  const branchName = (id: string | null) =>
    id
      ? branches.find((b) => b.id === id)?.nameAr || id
      : text("بدون فرع", "No branch");
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
    let stop = false;
    const c = new AbortController();
    api("catalog", undefined, c.signal)
      .then((j) => {
        if (!stop) setBranches(j.branches);
      })
      .catch((e) => {
        if (!stop) setError(e.message);
      });
    return () => {
      stop = true;
      c.abort();
    };
  }, [rid]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("receipt");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) void show({ id });
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
      `inventory/purchases?status=${status}&offset=${offset}&search=${encodeURIComponent(query)}`,
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
          setError(e.message);
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
      c.abort();
    };
  }, [rid, status, query, offset, refresh]);
  useEffect(() => {
    if (!form) return;
    let stop = false;
    const c = new AbortController();
    const timer = setTimeout(() => {
      setPickError("");
      Promise.all([
        api(
          `inventory/suppliers?status=active&search=${encodeURIComponent(supplierSearch)}`,
          undefined,
          c.signal,
        ),
        api(
          `inventory/items?status=active&search=${encodeURIComponent(itemSearch)}`,
          undefined,
          c.signal,
        ),
      ])
        .then(([s, i]) => {
          if (!stop) {
            setSuppliers(s.rows);
            setMaterials(i.rows);
          }
        })
        .catch((e) => {
          if (!stop) setPickError(e.message);
        });
    }, 250);
    return () => {
      stop = true;
      clearTimeout(timer);
      c.abort();
    };
  }, [!!form, supplierSearch, itemSearch]);
  function close() {
    if (saving) return;
    if (
      form &&
      !confirm(
        text(
          "تجاهل مستند الاستلام غير المحفوظ؟",
          "Discard the unsaved receipt?",
        ),
      )
    )
      return;
    setForm(null);
  }
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (form) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [!!form]);
  useEffect(() => {
    if (!form && !detail && !detailBusy) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        if (form) close();
        else {
          detailVersion.current++;
          setDetail(null);
          setDetailBusy(false);
          setDetailError("");
        }
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
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [!!form, !!detail, detailBusy, saving]);
  function lineAmounts(l: EditLine) {
    const q = normal(l.quantity),
      c = normal(l.cost);
    if (
      !/^\d{1,7}(\.\d{1,3})?$/.test(q) ||
      !/^\d{1,7}(\.\d{1,2})?$/.test(c) ||
      Number(q) <= 0 ||
      Number(q) > 1000000 ||
      Number(c) > 1000000
    )
      return null;
    const [whole, fraction = ""] = q.split("."),
      [costWhole, costFrac = ""] = c.split(".");
    const qm = Number(whole) * 1000 + Number(fraction.padEnd(3, "0")),
      minor = Number(costWhole) * 100 + Number(costFrac.padEnd(2, "0"));
    return {
      quantity: q,
      unitCostMinor: minor,
      total: Number((BigInt(qm) * BigInt(minor) + 500n) / 1000n),
    };
  }
  const preview = form?.lines.map(lineAmounts) || [],
    previewTotal = preview.reduce((sum, r) => sum + (r?.total || 0), 0);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || flight.current) return;
    setFormError("");
    if (
      !form.lines.length ||
      preview.some((x) => !x) ||
      previewTotal > 2000000000
    ) {
      setFormError(
        text(
          "أضف مواد بكميات موجبة حتى 3 منازل وتكلفة حتى منزلتين، وراجع إجمالي المستند.",
          "Add materials with positive quantities up to 3 decimals and costs up to 2 decimals; check the document total.",
        ),
      );
      return;
    }
    if (
      !confirm(
        text(
          `اعتماد استلام بقيمة ${money(previewTotal)} ر.س وزيادة مخزون ${branchName(form.branchId || null)} الآن؟`,
          `Post receipt for SAR ${money(previewTotal)} and increase stock at ${branchName(form.branchId || null)} now?`,
        ),
      )
    )
      return;
    flight.current = true;
    setSaving(true);
    try {
      const doc = await api("inventory/purchases", {
        id: form.id,
        supplierId: form.supplierId,
        branchId: form.branchId || null,
        reference: form.reference,
        documentDate: form.date,
        notes: form.notes,
        items: form.lines.map((line, i) => ({
          itemId: line.item.id,
          expectedUnit: line.item.unit,
          quantity: preview[i]!.quantity,
          unitCostMinor: preview[i]!.unitCostMinor,
        })),
      });
      setForm(null);
      setDetail(doc);
      setDetailError("");
      setRefresh((v) => v + 1);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      flight.current = false;
      setSaving(false);
    }
  }
  async function show(doc: Pick<Document, "id">) {
    const version = ++detailVersion.current;
    setDetail(null);
    setDetailBusy(true);
    setDetailError("");
    try {
      const result = await api(`inventory/purchases/${doc.id}`);
      if (version === detailVersion.current) setDetail(result);
    } catch (e) {
      if (version === detailVersion.current)
        setDetailError((e as Error).message);
    } finally {
      if (version === detailVersion.current) setDetailBusy(false);
    }
  }
  async function cancel() {
    if (!detail || flight.current) return;
    const reason = prompt(
      text(
        "سبب إلغاء الاستلام (3 أحرف على الأقل)",
        "Reason for reversing this receipt (at least 3 characters)",
      ),
    );
    if (!reason) return;
    if (reason.trim().length < 3 || reason.length > 500) {
      setDetailError(
        text("اكتب سببًا من 3 إلى 500 حرف", "Use a reason of 3–500 characters"),
      );
      return;
    }
    if (
      !confirm(
        text(
          "سيعكس الإلغاء جميع كميات الاستلام من هذا الموقع. تأكد من أن هذا التصحيح يطابق المخزون الفعلي. متابعة؟",
          "Cancellation reverses all received quantities at this location. Confirm the correction reflects physical stock. Continue?",
        ),
      )
    )
      return;
    flight.current = true;
    setSaving(true);
    setDetailError("");
    try {
      const result = await api(`inventory/purchases/${detail.id}/cancel`, {
        reason: reason.trim(),
      });
      setDetail(result);
      setRefresh((v) => v + 1);
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      flight.current = false;
      setSaving(false);
    }
  }
  function exportCsv() {
    const data = [
      [
        text("مرجع المورد", "Supplier reference"),
        text("المورد", "Supplier"),
        text("الموقع", "Location"),
        text("التاريخ", "Document date"),
        text("القيمة المدخلة ر.س", "Entered value SAR"),
        text("الحالة", "Status"),
      ],
      ...rows.map((r) => [
        r.reference,
        r.supplierName,
        branchName(r.branchId),
        r.documentDate,
        money(r.totalMinor),
        r.status,
      ]),
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
    a.download = `TITO-purchases-page-${offset / 50 + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="md-shell" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <ManagerSidebar lang={lang} active="purchases" mobile={mobile} />
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
              "المخزون / استلام المشتريات",
              "Inventory / Purchase receipts",
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
              <p>TITO · PURCHASE RECEIPTS</p>
              <h1>{text("استلام المشتريات", "Purchase receipts")}</h1>
              <span>
                {text(
                  "سند مورد مرتبط بكميات مخزون موقع محدد",
                  "Supplier receipts linked to location stock quantities",
                )}
              </span>
            </div>
            <button
              className="md-primary"
              onClick={() => {
                setForm({
                  id: crypto.randomUUID(),
                  supplierId: "",
                  supplierLabel: "",
                  branchId: "",
                  reference: "",
                  date: today(),
                  notes: "",
                  lines: [],
                });
                setSuppliers([]);
                setMaterials([]);
                setSupplierSearch("");
                setItemSearch("");
                setFormError("");
              }}
            >
              <Plus size={17} />
              {text("استلام جديد", "New receipt")}
            </button>
          </div>
          <p className="iv-notice">
            {text(
              "اعتماد الاستلام يزيد الكميات فورًا. القيم تسجل كما تدخلها دون حساب ضريبة، ولا تمثل إثبات دفع أو فاتورة ضريبية أو رصيد حساب المورد. لا تسجل استلامًا يدويًا آخر للكميات نفسها.",
              "Posting increases stock immediately. Values are recorded as entered without tax calculation; this is not proof of payment, a tax invoice or a supplier account balance. Do not record another manual receipt for the same quantities.",
            )}
          </p>
          <section className="md-card iv-list">
            <div className="iv-list-toolbar">
              <div className="iv-tabs">
                {["all", "posted", "cancelled"].map((s) => (
                  <button
                    key={s}
                    className={status === s ? "active" : ""}
                    onClick={() => {
                      setStatus(s);
                      setOffset(0);
                    }}
                  >
                    {s === "all"
                      ? text("الكل", "All")
                      : s === "posted"
                        ? text("معتمد", "Posted")
                        : text("ملغى", "Cancelled")}
                  </button>
                ))}
              </div>
              <button
                disabled={loading || !rows.length || query !== search.trim()}
                onClick={exportCsv}
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
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={text(
                    "ابحث بمرجع المستند أو المورد…",
                    "Search document reference or supplier…",
                  )}
                />
              </label>
              <button
                disabled={loading}
                onClick={() => setRefresh((v) => v + 1)}
              >
                <RefreshCw size={16} />
                {text("تحديث", "Refresh")}
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
                        text("مرجع المورد", "Supplier reference"),
                        text("المورد", "Supplier"),
                        text("الموقع", "Location"),
                        text("تاريخ المستند", "Document date"),
                        text("القيمة ر.س", "Value SAR"),
                        text("الحالة", "Status"),
                        text("التفاصيل", "Details"),
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.reference}</td>
                        <td>{r.supplierName}</td>
                        <td>{branchName(r.branchId)}</td>
                        <td>{r.documentDate}</td>
                        <td>{money(r.totalMinor)}</td>
                        <td>
                          <span
                            className={
                              "iv-badge " +
                              (r.status === "posted" ? "is-active" : "")
                            }
                          >
                            {r.status === "posted"
                              ? text("معتمد", "Posted")
                              : text("ملغى", "Cancelled")}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => show(r)}>
                            {text("عرض", "View")}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!rows.length && !error && (
                      <tr>
                        <td colSpan={7} className="iv-empty">
                          {text(
                            "لا توجد مستندات مطابقة",
                            "No matching receipts",
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
                  ? `${offset + 1}–${Math.min(offset + 50, total)} / ${total}`
                  : "0"}
              </span>
              <button
                disabled={loading || !offset}
                onClick={() => setOffset((v) => v - 50)}
              >
                {text("السابق", "Previous")}
              </button>
              <button
                disabled={loading || offset + 50 >= total}
                onClick={() => setOffset((v) => v + 50)}
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
          aria-label={text("استلام جديد", "New receipt")}
        >
          <form className="iv-drawer iv-purchase-drawer" onSubmit={save}>
            <header>
              <h2>{text("استلام مشتريات جديد", "New purchase receipt")}</h2>
              <button type="button" disabled={saving} onClick={close}>
                {text("إغلاق ×", "Close ×")}
              </button>
            </header>
            <fieldset disabled={saving}>
              <div className="iv-fields">
                <label>
                  {text("ابحث عن المورد", "Search supplier")}
                  <input
                    autoFocus
                    type="search"
                    value={supplierSearch}
                    maxLength={150}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                  />
                </label>
                <label>
                  {text("المورد", "Supplier")}
                  <select
                    required
                    value={form.supplierId}
                    onChange={(e) =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              supplierId: e.target.value,
                              supplierLabel:
                                suppliers.find((s) => s.id === e.target.value)
                                  ?.nameAr || "",
                            }
                          : f,
                      )
                    }
                  >
                    <option value="">
                      {text("اختر المورد", "Choose supplier")}
                    </option>
                    {form.supplierId &&
                      !suppliers.some((s) => s.id === form.supplierId) && (
                        <option value={form.supplierId}>
                          {form.supplierLabel || form.supplierId}
                        </option>
                      )}
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameAr} · {s.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {text("موقع الاستلام", "Receiving location")}
                  <select
                    value={form.branchId}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, branchId: e.target.value } : f,
                      )
                    }
                  >
                    <option value="">
                      {text(
                        "بدون فرع — رصيد مستقل",
                        "No branch — separate balance",
                      )}
                    </option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameAr}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {text("مرجع فاتورة المورد", "Supplier invoice reference")}
                  <input
                    required
                    value={form.reference}
                    maxLength={100}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, reference: e.target.value } : f,
                      )
                    }
                  />
                </label>
                <label>
                  {text("تاريخ مستند المورد", "Supplier document date")}
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, date: e.target.value } : f))
                    }
                  />
                </label>
                <label>
                  {text("ابحث عن مادة لإضافتها", "Search item to add")}
                  <input
                    type="search"
                    maxLength={150}
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                </label>
                <p className="iv-help">
                  {text(
                    "البحث يعرض أول 50 موردًا أو مادة نشطة. تكلفة الوحدة تبدأ من التكلفة المرجعية؛ عدّلها حسب مستند المورد. حد 50 مادة للمستند، ولا تحويل تلقائي للوحدات.",
                    "Search shows the first 50 active suppliers or items. Unit costs start from reference costs; adjust them to the supplier document. Maximum 50 items per receipt; no automatic unit conversion.",
                  )}
                </p>
                <div className="iv-wide iv-purchase-picker">
                  {materials
                    .filter((m) => !form.lines.some((l) => l.item.id === m.id))
                    .map((m) => (
                      <button
                        type="button"
                        disabled={form.lines.length >= 50}
                        key={m.id}
                        onClick={() =>
                          setForm((f) =>
                            f
                              ? {
                                  ...f,
                                  lines: [
                                    ...f.lines,
                                    {
                                      item: m,
                                      quantity: "1",
                                      cost: money(m.referenceCostMinor),
                                    },
                                  ],
                                }
                              : f,
                          )
                        }
                      >
                        + {lang === "ar" ? m.nameAr : m.nameEn || m.nameAr} ·{" "}
                        {m.code} ({m.unit})
                      </button>
                    ))}
                </div>
                {pickError && <p className="md-error">{pickError}</p>}
                {form.lines.map((line, i) => (
                  <div className="iv-wide iv-purchase-line" key={line.item.id}>
                    <b>
                      {lang === "ar"
                        ? line.item.nameAr
                        : line.item.nameEn || line.item.nameAr}{" "}
                      · {line.item.code} ({line.item.unit})
                    </b>
                    <div>
                      <label>
                        {text("الكمية", "Quantity")}
                        <input
                          required
                          maxLength={20}
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) =>
                            setForm((f) =>
                              f
                                ? {
                                    ...f,
                                    lines: f.lines.map((l, index) =>
                                      index === i
                                        ? { ...l, quantity: e.target.value }
                                        : l,
                                    ),
                                  }
                                : f,
                            )
                          }
                        />
                      </label>
                      <label>
                        {text("تكلفة الوحدة ر.س", "Unit cost SAR")}
                        <input
                          required
                          maxLength={20}
                          inputMode="decimal"
                          value={line.cost}
                          onChange={(e) =>
                            setForm((f) =>
                              f
                                ? {
                                    ...f,
                                    lines: f.lines.map((l, index) =>
                                      index === i
                                        ? { ...l, cost: e.target.value }
                                        : l,
                                    ),
                                  }
                                : f,
                            )
                          }
                        />
                      </label>
                      <strong>
                        {preview[i] ? money(preview[i]!.total) : "—"}
                      </strong>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) =>
                            f
                              ? {
                                  ...f,
                                  lines: f.lines.filter(
                                    (_, index) => index !== i,
                                  ),
                                }
                              : f,
                          )
                        }
                      >
                        {text("إزالة", "Remove")}
                      </button>
                    </div>
                  </div>
                ))}
                <label className="iv-wide">
                  {text("ملاحظات", "Notes")}
                  <textarea
                    value={form.notes}
                    maxLength={1000}
                    rows={3}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, notes: e.target.value } : f))
                    }
                  />
                </label>
              </div>
            </fieldset>
            <p>
              <b>
                {text("الإجمالي المدخل", "Entered total")}:{" "}
                {money(previewTotal)} {text("ر.س", "SAR")}
              </b>
            </p>
            {formError && (
              <p className="md-error" role="alert">
                {formError}
              </p>
            )}
            <footer>
              <button
                type="submit"
                className="md-primary"
                disabled={saving || !form.lines.length}
              >
                {saving
                  ? text("جارٍ الاعتماد…", "Posting…")
                  : text("اعتماد واستلام المخزون", "Post and receive stock")}
              </button>
              <button type="button" disabled={saving} onClick={close}>
                {text("إلغاء", "Cancel")}
              </button>
            </footer>
          </form>
        </div>
      )}
      {(detail || detailBusy || detailError) && !form && (
        <div
          className="iv-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={text("تفاصيل الاستلام", "Receipt details")}
        >
          <section className="iv-drawer iv-purchase-drawer">
            <header>
              <h2>
                {text("سند استلام مشتريات", "Purchase receipt")}{" "}
                {detail?.reference}
              </h2>
              <button
                autoFocus
                disabled={saving}
                onClick={() => {
                  detailVersion.current++;
                  setDetail(null);
                  setDetailBusy(false);
                  setDetailError("");
                }}
              >
                {text("إغلاق ×", "Close ×")}
              </button>
            </header>
            {detailBusy ? (
              <p>{text("جارٍ التحميل…", "Loading…")}</p>
            ) : (
              detail && (
                <>
                  <p>
                    {detail.supplierName} · {detail.supplierCode} ·{" "}
                    {branchName(detail.branchId)} · {detail.documentDate}
                  </p>
                  <p>
                    {text("مرجع الاستلام", "Receipt reference")}:{" "}
                    {detail.id.slice(0, 8).toUpperCase()} ·{" "}
                    {detail.status === "posted"
                      ? text("معتمد", "Posted")
                      : text("ملغى", "Cancelled")}
                  </p>
                  <div className="iv-table">
                    <table>
                      <thead>
                        <tr>
                          {[
                            text("المادة", "Item"),
                            text("الوحدة", "Unit"),
                            text("الكمية", "Quantity"),
                            text("تكلفة الوحدة", "Unit cost"),
                            text("القيمة ر.س", "Value SAR"),
                          ].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((l) => (
                          <tr key={l.itemId}>
                            <td>
                              {lang === "ar" ? l.nameAr : l.nameEn || l.nameAr}
                              <small>{l.code}</small>
                            </td>
                            <td>{l.unit}</td>
                            <td>{qty(l.quantityMilli)}</td>
                            <td>{money(l.unitCostMinor)}</td>
                            <td>{money(l.lineTotalMinor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    <b>
                      {text("الإجمالي المدخل ر.س", "Entered total SAR")}:{" "}
                      {money(detail.totalMinor)}
                    </b>
                  </p>
                  <p className="iv-stock-reason">{detail.notes}</p>
                  {detail.status === "cancelled" && (
                    <p className="md-warning">
                      {text("سبب الإلغاء", "Cancellation reason")}:{" "}
                      {detail.cancellationReason}
                      <br />
                      {detail.cancelledAt &&
                        new Date(detail.cancelledAt).toLocaleString(
                          lang === "ar" ? "ar-SA" : "en-GB",
                          { timeZone: "Asia/Riyadh" },
                        )}
                    </p>
                  )}
                  <p className="iv-help">
                    {text(
                      "السند المعتمد ثابت؛ الإلغاء يعكس كل الكميات إذا توفرت في الموقع. لا يسجل رد أموال أو سداد مورد.",
                      "Posted receipts are immutable. Cancellation reverses all quantities if available at this location. It does not refund money or settle supplier accounts.",
                    )}
                  </p>
                  {detail.status === "posted" && (
                    <footer>
                      <button disabled={saving} onClick={cancel}>
                        {saving
                          ? text("جارٍ الإلغاء…", "Reversing…")
                          : text(
                              "إلغاء الاستلام وعكس الكميات",
                              "Cancel receipt and reverse quantities",
                            )}
                      </button>
                    </footer>
                  )}
                </>
              )
            )}
            {detailError && (
              <p className="md-error" role="alert">
                {detailError}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
