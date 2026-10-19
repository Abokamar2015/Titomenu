import { useEffect, useRef, useState } from "react";
import { Menu, Globe, Plus, Search, Download, RefreshCw } from "lucide-react";
import {
  isAuthenticated,
  getCurrentRestaurantId,
  getCurrentMembership,
  getCurrentUser,
  getAuthToken,
} from "@/lib/supabase";
import { LoginScreen } from "./AdminPage";
import ManagerSidebar from "./ManagerSidebar";
import "./manager-dashboard.css";
import "./inventory.css";
type Kind = "suppliers" | "items";
type Row = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  notes: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  unit?: string;
  category?: string;
  minimumQuantity?: string;
  referenceCostMinor?: number;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierActive?: boolean | null;
};
type Form = Row & { cost: string };
type HistoryEvent = {
  id: string;
  userName: string;
  action: string;
  createdAt: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown>;
};
export default function InventoryPage({ kind }: { kind: Kind }) {
  const [, rerender] = useState(0);
  if (!isAuthenticated())
    return <LoginScreen onLogin={() => rerender((v) => v + 1)} />;
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
        هذا القسم للمدير فقط. <a href="/pos">فتح الكاشير</a>
      </div>
    );
  return <InventoryManager key={kind + getCurrentRestaurantId()} kind={kind} />;
}
function InventoryManager({ kind }: { kind: Kind }) {
  const [lang, setLang] = useState<"ar" | "en">("ar"),
    [mobile, setMobile] = useState(false),
    [status, setStatus] = useState("active"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null),
    [creating, setCreating] = useState(false),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState(""),
    [dirty, setDirty] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState(""),
    [suppliers, setSuppliers] = useState<Row[]>([]),
    [supplierError, setSupplierError] = useState(""),
    [supplierLoading, setSupplierLoading] = useState(false);
  const [history, setHistory] = useState<{
      row: Row;
      events: HistoryEvent[];
    } | null>(null),
    [historyBusy, setHistoryBusy] = useState(false),
    [historyError, setHistoryError] = useState("");
  const flight = useRef(false),
    historyVersion = useRef(0),
    rid = getCurrentRestaurantId();
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en),
    title =
      kind === "suppliers"
        ? text("الموردون", "Suppliers")
        : text("مواد المخزون", "Inventory items");
  const unitLabels: Record<string, string> = {
    g: text("جرام", "Gram"),
    kg: text("كيلوجرام", "Kilogram"),
    ml: text("ملليلتر", "Milliliter"),
    l: text("لتر", "Liter"),
    pcs: text("قطعة", "Piece"),
    pack: text("عبوة", "Pack"),
  };
  const money = (minor: number) => (minor / 100).toFixed(2),
    date = (v: string) =>
      new Date(v).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB", {
        timeZone: "Asia/Riyadh",
      });
  async function api(path: string, body?: unknown, signal?: AbortSignal) {
    const res = await fetch(`/api/restaurants/${rid}/pos/inventory/${path}`, {
      signal,
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = await res.json();
    if (!res.ok)
      throw Error(
        j.error || text("تعذر إكمال العملية", "Could not complete the action"),
      );
    return j;
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let stop = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(
      `${kind}?status=${status}&search=${encodeURIComponent(query)}&offset=${offset}`,
      undefined,
      controller.signal,
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
      controller.abort();
    };
  }, [kind, status, query, offset, refresh, rid]);
  useEffect(() => {
    if (!form || kind !== "items") return;
    let stop = false;
    const controller = new AbortController();
    setSupplierLoading(true);
    setSupplierError("");
    const timer = setTimeout(() => {
      api(
        `suppliers?status=active&search=${encodeURIComponent(supplierSearch)}`,
        undefined,
        controller.signal,
      )
        .then((j) => {
          if (!stop) setSuppliers(j.rows);
        })
        .catch((e) => {
          if (!stop) setSupplierError(e.message);
        })
        .finally(() => {
          if (!stop) setSupplierLoading(false);
        });
    }, 250);
    return () => {
      stop = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [!!form, supplierSearch, kind]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (form && dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [!!form, dirty]);
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
        const overlay = document.querySelector(".iv-overlay");
        const nodes = Array.from(
          overlay?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ) || [],
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [!!form, !!history, saving, dirty]);
  function edit(row?: Row) {
    setCreating(!row);
    setDirty(false);
    setFormError("");
    setSupplierSearch("");
    setSuppliers([]);
    setForm({
      ...(row || {
        id: crypto.randomUUID(),
        code: "",
        nameAr: "",
        nameEn: "",
        notes: "",
        isActive: true,
        version: 1,
        updatedAt: "",
        contactName: "",
        phone: "",
        email: "",
        address: "",
        unit: "pcs",
        category: "",
        minimumQuantity: "0.000",
        referenceCostMinor: 0,
        supplierId: null,
      }),
      cost: money(row?.referenceCostMinor || 0),
    });
  }
  function close() {
    if (saving) return;
    if (
      dirty &&
      !confirm(
        text("تجاهل التعديلات غير المحفوظة؟", "Discard unsaved changes?"),
      )
    )
      return;
    setForm(null);
  }
  function patch<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
  }
  function normalize(v: string) {
    return v
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
      .replace(/[٫,]/g, ".")
      .trim();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || flight.current) return;
    setFormError("");
    const cost = normalize(form.cost),
      minimum = normalize(form.minimumQuantity || "0");
    if (
      kind === "items" &&
      (!/^\d+(\.\d{1,2})?$/.test(cost) ||
        Number(cost) > 1000000 ||
        !/^\d{1,7}(\.\d{1,3})?$/.test(minimum) ||
        Number(minimum) > 1000000)
    ) {
      setFormError(
        text(
          "أدخل تكلفة حتى منزلتين وكمية حتى 3 منازل، من صفر إلى مليون.",
          "Enter cost up to 2 decimals and quantity up to 3 decimals, from zero to one million.",
        ),
      );
      return;
    }
    const common = {
      id: form.id,
      version: form.version,
      code: form.code,
      nameAr: form.nameAr,
      nameEn: form.nameEn,
      notes: form.notes,
      isActive: form.isActive,
    };
    const body =
      kind === "suppliers"
        ? {
            ...common,
            contactName: form.contactName || "",
            phone: form.phone || "",
            email: (form.email || "").trim(),
            address: form.address || "",
          }
        : {
            ...common,
            unit: form.unit,
            category: form.category || "",
            minimumQuantity: minimum,
            referenceCostMinor: Math.round(Number(cost) * 100),
            supplierId: form.supplierId || null,
          };
    flight.current = true;
    setSaving(true);
    try {
      await api(kind + (creating ? "" : "/" + form.id), body);
      setForm(null);
      setDirty(false);
      setRefresh((v) => v + 1);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      flight.current = false;
      setSaving(false);
    }
  }
  async function showHistory(row: Row) {
    const version = ++historyVersion.current;
    setHistory({ row, events: [] });
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const j = await api(`${kind}/${row.id}/history`);
      if (version === historyVersion.current)
        setHistory({ row, events: j.events });
    } catch (e) {
      if (version === historyVersion.current)
        setHistoryError((e as Error).message);
    } finally {
      if (version === historyVersion.current) setHistoryBusy(false);
    }
  }
  function exportCsv() {
    const data =
      kind === "suppliers"
        ? [
            [
              text("الكود", "Code"),
              text("الاسم", "Name"),
              "English",
              text("التواصل", "Contact"),
              text("الهاتف", "Phone"),
              "Email",
              text("العنوان", "Address"),
              text("نشط", "Active"),
            ],
            ...rows.map((r) => [
              r.code,
              r.nameAr,
              r.nameEn,
              r.contactName || "",
              r.phone || "",
              r.email || "",
              r.address || "",
              r.isActive ? "1" : "0",
            ]),
          ]
        : [
            [
              text("الكود", "Code"),
              text("الاسم", "Name"),
              "English",
              text("التصنيف", "Category"),
              text("الوحدة", "Unit"),
              text("حد الطلب", "Minimum quantity"),
              text("التكلفة المرجعية ر.س", "Reference unit cost SAR"),
              text("المورد", "Supplier"),
              text("نشط", "Active"),
            ],
            ...rows.map((r) => [
              r.code,
              r.nameAr,
              r.nameEn,
              r.category || "",
              r.unit || "",
              r.minimumQuantity || "0",
              money(r.referenceCostMinor || 0),
              r.supplierName || "",
              r.isActive ? "1" : "0",
            ]),
          ];
    const csv =
      "\ufeff" +
      data
        .map((row) =>
          row
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
    a.download = `TITO-${kind}-page-${offset / 50 + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const fieldLabels: Record<string, string> = {
    code: text("الكود", "Code"),
    nameAr: text("الاسم الرئيسي / بالعربية", "Primary / Arabic name"),
    nameEn: text("الاسم بالإنجليزية", "English name"),
    contactName: text("جهة الاتصال", "Contact person"),
    phone: text("الهاتف", "Phone"),
    email: text("البريد الإلكتروني", "Email"),
    address: text("العنوان", "Address"),
    category: text("التصنيف", "Category"),
    unit: text("الوحدة", "Unit"),
    minimumQuantity: text("حد إعادة الطلب", "Reorder level"),
    referenceCostMinor: text("التكلفة المرجعية", "Reference cost"),
    supplierId: text("المورد", "Supplier"),
    notes: text("الملاحظات", "Notes"),
    isActive: text("نشط", "Active"),
  };
  function displayValue(key: string, value: unknown) {
    if (value === null || value === undefined || value === "") return "—";
    if (key === "isActive")
      return value ? text("نشط", "Active") : text("مؤرشف", "Archived");
    if (key === "referenceCostMinor")
      return money(Number(value)) + " " + text("ر.س", "SAR");
    if (key === "unit") return unitLabels[String(value)] || String(value);
    return String(value);
  }
  function input(
    key: keyof Form,
    label: string,
    maxLength: number,
    required = false,
    type = "text",
  ) {
    return (
      <label>
        {label}
        <input
          autoFocus={key === "nameAr"}
          required={required}
          type={type}
          maxLength={maxLength}
          value={String(form?.[key] ?? "")}
          onChange={(e) => patch(key, e.target.value as any)}
        />
      </label>
    );
  }
  return (
    <div className="md-shell" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <ManagerSidebar lang={lang} active={kind} mobile={mobile} />
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
            {text("المخزون", "Inventory")} / {title}
          </span>
          <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            <Globe size={16} />
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </header>
        <div className="md-content">
          <div className="md-heading">
            <div>
              <p>TITO · INVENTORY</p>
              <h1>{title}</h1>
              <span>
                {kind === "suppliers"
                  ? text(
                      "بيانات موردي مطعمك وجهات الاتصال",
                      "Your restaurant suppliers and contacts",
                    )
                  : text(
                      "تعريف المواد والوحدات والتكلفة المرجعية",
                      "Define materials, units and reference costs",
                    )}
              </span>
            </div>
            <button className="md-primary" onClick={() => edit()}>
              <Plus size={17} />
              {kind === "suppliers"
                ? text("إضافة مورد", "Add supplier")
                : text("إنشاء مادة مخزون", "Create inventory item")}
            </button>
          </div>
          {kind === "items" && (
            <p className="iv-notice">
              {text(
                "هذه شاشة تعريف المواد. لا تعرض رصيدًا فعليًا، والتكلفة مرجعية لكل وحدة. الربط بالمشتريات والوصفات والخصم الآلي غير مفعّل بعد.",
                "This is the item catalog. It does not show on-hand balances. Costs are reference amounts per unit; purchasing, recipes and automatic stock deduction are not connected yet.",
              )}
            </p>
          )}
          <section className="md-card iv-list">
            <div className="iv-list-toolbar">
              <div className="iv-tabs">
                {["all", "active", "archived"].map((s) => (
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
                      : s === "active"
                        ? text("نشط", "Active")
                        : text("مؤرشف", "Archived")}
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
                <Search size={17} />
                <input
                  type="search"
                  value={search}
                  maxLength={150}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={text(
                    "ابحث بالاسم أو الكود…",
                    "Search name or code…",
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
              <div className="md-error" role="alert">
                {error}
              </div>
            )}
            {loading ? (
              <p className="md-loading" role="status">
                {text("جارٍ التحميل…", "Loading…")}
              </p>
            ) : (
              <div className="iv-table">
                <table>
                  <thead>
                    <tr>
                      <th>{text("الاسم", "Name")}</th>
                      <th>{text("الكود", "Code")}</th>
                      {kind === "suppliers" ? (
                        <>
                          <th>{text("جهة الاتصال", "Contact")}</th>
                          <th>{text("الهاتف", "Phone")}</th>
                        </>
                      ) : (
                        <>
                          <th>{text("التصنيف", "Category")}</th>
                          <th>{text("الوحدة", "Unit")}</th>
                          <th>{text("حد إعادة الطلب", "Reorder level")}</th>
                          <th>
                            {text(
                              "تكلفة الوحدة ر.س",
                              "Unit reference cost SAR",
                            )}
                          </th>
                          <th>{text("المورد المفضل", "Preferred supplier")}</th>
                        </>
                      )}
                      <th>{text("الحالة", "Status")}</th>
                      <th>{text("إجراءات", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <b>
                            {lang === "ar" ? r.nameAr : r.nameEn || r.nameAr}
                          </b>
                          <small>{lang === "ar" ? r.nameEn : r.nameAr}</small>
                        </td>
                        <td dir="ltr">{r.code}</td>
                        {kind === "suppliers" ? (
                          <>
                            <td>{r.contactName || "—"}</td>
                            <td dir="ltr">{r.phone || "—"}</td>
                          </>
                        ) : (
                          <>
                            <td>{r.category || "—"}</td>
                            <td>{unitLabels[r.unit || ""] || r.unit}</td>
                            <td>{r.minimumQuantity}</td>
                            <td>{money(r.referenceCostMinor || 0)}</td>
                            <td>
                              {r.supplierName || "—"}
                              {r.supplierName && r.supplierActive === false && (
                                <small>{text("مؤرشف", "Archived")}</small>
                              )}
                            </td>
                          </>
                        )}
                        <td>
                          <span
                            className={
                              "iv-badge " + (r.isActive ? "is-active" : "")
                            }
                          >
                            {r.isActive
                              ? text("نشط", "Active")
                              : text("مؤرشف", "Archived")}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => edit(r)}>
                            {text("تعديل", "Edit")}
                          </button>
                          <button onClick={() => showHistory(r)}>
                            {text("السجل", "History")}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!rows.length && !error && (
                      <tr>
                        <td
                          colSpan={kind === "items" ? 9 : 6}
                          className="iv-empty"
                        >
                          {text(
                            "لا توجد سجلات تطابق البحث. أضف سجلًا جديدًا أو غيّر الفلاتر.",
                            "No matching records. Add a record or change the filters.",
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
                  : "0"}{" "}
                · {text("50 سجلًا لكل صفحة", "50 records per page")}
              </span>
              <button
                disabled={loading || offset === 0}
                onClick={() => setOffset((n) => Math.max(0, n - 50))}
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
          aria-label={
            creating
              ? text("إضافة سجل", "Create record")
              : text("تعديل سجل", "Edit record")
          }
        >
          <form className="iv-drawer" onSubmit={save}>
            <header>
              <div>
                <small>{title}</small>
                <h2>
                  {creating
                    ? text("إضافة جديد", "Create new")
                    : text("تعديل السجل", "Edit record")}
                </h2>
              </div>
              <button type="button" disabled={saving} onClick={close}>
                {text("إغلاق ×", "Close ×")}
              </button>
            </header>
            <fieldset disabled={saving}>
              <div className="iv-fields">
                {input("nameAr", fieldLabels.nameAr, 150, true)}
                {input("nameEn", fieldLabels.nameEn, 150)}
                {input(
                  "code",
                  text("الكود * (A–Z, 0–9, _ , -)", "Code * (A–Z, 0–9, _ , -)"),
                  40,
                  true,
                )}
                <p className="iv-help">
                  {text(
                    "الكود فريد داخل المطعم حتى للسجلات المؤرشفة، وتُحوّل الحروف للإنجليزية الكبيرة.",
                    "Codes are unique within the restaurant, including archived records. Letters are normalized to uppercase.",
                  )}
                </p>
                {kind === "suppliers" ? (
                  <>
                    {input("contactName", fieldLabels.contactName, 150)}
                    {input("phone", fieldLabels.phone, 40, false, "tel")}
                    {input("email", fieldLabels.email, 150, false, "email")}
                    {input("address", fieldLabels.address, 500)}
                  </>
                ) : (
                  <>
                    {input("category", fieldLabels.category, 100)}
                    <label>
                      {fieldLabels.unit}
                      <select
                        required
                        value={form.unit}
                        onChange={(e) => patch("unit", e.target.value)}
                      >
                        {Object.entries(unitLabels).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v} ({k})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {fieldLabels.minimumQuantity}
                      <input
                        required
                        inputMode="decimal"
                        value={form.minimumQuantity}
                        onChange={(e) =>
                          patch("minimumQuantity", e.target.value)
                        }
                        maxLength={20}
                      />
                    </label>
                    <label>
                      {text(
                        "التكلفة المرجعية لكل وحدة (ر.س)",
                        "Reference cost per unit (SAR)",
                      )}
                      <input
                        required
                        inputMode="decimal"
                        value={form.cost}
                        onChange={(e) => patch("cost", e.target.value)}
                        maxLength={20}
                      />
                    </label>
                    <label>
                      {text(
                        "ابحث عن المورد المفضل",
                        "Search preferred supplier",
                      )}
                      <input
                        type="search"
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        maxLength={150}
                      />
                    </label>
                    <label>
                      {fieldLabels.supplierId}
                      <select
                        value={form.supplierId || ""}
                        onChange={(e) =>
                          (() => {
                            const selected = suppliers.find(
                              (s) => s.id === e.target.value,
                            );
                            setForm((f) =>
                              f
                                ? {
                                    ...f,
                                    supplierId: e.target.value || null,
                                    supplierName: selected?.nameAr || null,
                                  }
                                : f,
                            );
                            setDirty(true);
                          })()
                        }
                      >
                        <option value="">
                          {text("بدون مورد مفضل", "No preferred supplier")}
                        </option>
                        {form.supplierId &&
                          !suppliers.some((s) => s.id === form.supplierId) && (
                            <option value={form.supplierId}>
                              {form.supplierName || form.supplierId}
                            </option>
                          )}
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nameAr} · {s.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    {supplierLoading && (
                      <small>
                        {text(
                          "جارٍ البحث عن الموردين…",
                          "Searching suppliers…",
                        )}
                      </small>
                    )}
                    {supplierError && (
                      <p className="md-error">{supplierError}</p>
                    )}
                    <p className="iv-help">
                      {text(
                        "يعرض بحث الموردين أول 50 موردًا نشطًا؛ اكتب الاسم أو الكود لتضييق النتائج. لا توجد تحويلات وحدات تلقائية.",
                        "Supplier search shows the first 50 active matches; narrow by name or code. Unit conversions are not automatic.",
                      )}
                    </p>
                  </>
                )}
                <label className="iv-wide">
                  {fieldLabels.notes}
                  <textarea
                    value={form.notes}
                    maxLength={1000}
                    onChange={(e) => patch("notes", e.target.value)}
                    rows={3}
                  />
                </label>
                <label className="iv-checkbox">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => patch("isActive", e.target.checked)}
                  />
                  {text(
                    "نشط — أزل الاختيار للأرشفة مع حفظ السجل",
                    "Active — uncheck to archive while preserving history",
                  )}
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
                {saving ? text("جارٍ الحفظ…", "Saving…") : text("حفظ", "Save")}
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
          className="iv-overlay iv-history"
          role="dialog"
          aria-modal="true"
          aria-label={text("سجل التغييرات", "Change history")}
        >
          <section className="iv-drawer">
            <header>
              <h2>
                {text("سجل التغييرات", "Change history")} · {history.row.code}
              </h2>
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
                "أحدث 50 عملية · توقيت الرياض",
                "Latest 50 changes · Riyadh time",
              )}
            </p>
            {historyBusy ? (
              <p>{text("جارٍ التحميل…", "Loading…")}</p>
            ) : historyError ? (
              <p role="alert">{historyError}</p>
            ) : (
              history.events.map((event) => (
                <article className="iv-event" key={event.id}>
                  <b>
                    {event.action === "create"
                      ? text("إنشاء", "Created")
                      : text("تعديل", "Updated")}
                  </b>
                  <p>
                    {event.userName} · {date(event.createdAt)}
                  </p>
                  <dl>
                    {Object.entries(event.afterData)
                      .filter(
                        ([k, v]) =>
                          fieldLabels[k] &&
                          (!event.beforeData ||
                            JSON.stringify(event.beforeData[k]) !==
                              JSON.stringify(v)),
                      )
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt>{fieldLabels[k]}</dt>
                          <dd>
                            {event.beforeData && (
                              <del>{displayValue(k, event.beforeData[k])}</del>
                            )}
                            <span>{displayValue(k, v)}</span>
                          </dd>
                        </div>
                      ))}
                  </dl>
                </article>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
