import { useState, useEffect, useRef } from "react";
import {
  getAuthToken,
  isAuthenticated,
  getCurrentRestaurantId,
  getCurrentRestaurantSlug,
  DEFAULT_SLUG,
} from "@/lib/supabase";
import { LoginScreen } from "./AdminPage";
import "./pos.css";
type Product = {
  id: string;
  nameAr: string;
  nameEn: string;
  price: number;
  category: string;
  imageUrl: string | null;
};
type Branch = {
  id: string;
  nameAr: string;
  nameEn?: string;
};
type Order = {
  id: string;
  branchId: string | null;
  items: {
    id: string;
    name_ar: string;
    name_en?: string;
    price_minor: number;
    qty: number;
  }[];
  totalMinor: number;
  payment: string;
  service: string;
  note: string;
  createdAt: string;
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function PosPage() {
  const [authenticated, A] = useState(isAuthenticated());
  if (!authenticated) return <LoginScreen onLogin={() => A(true)} />;
  if (!getCurrentRestaurantId())
    return (
      <div
        className="dark min-h-screen bg-background text-foreground p-12"
        dir="rtl"
      >
        <h1>اختر مطعمًا أولاً من لوحة المنصة.</h1>
        <a href="/sa">فتح لوحة المنصة ←</a>
      </div>
    );
  return <Cashier key={getCurrentRestaurantId()!} />;
}
const POS_EN: Record<string, string> = {
  "تعذر إكمال العملية": "Unable to complete this action",
  "رقم الطلب": "Order number",
  تاريخ: "Date",
  الدفع: "Payment",
  "الإجمالي ر.س": "Total SAR",
  نقدي: "Cash",
  بطاقة: "Card",
  "نقطة البيع": "Point of sale",
  "الطلبات والتقارير": "Orders & reports",
  "بحث عن صنف": "Search products",
  "ابحث عن صنف…": "Search products…",
  سفري: "Takeaway",
  محلي: "Dine in",
  "رقم الطاولة / ملاحظات التحضير": "Table number / preparation notes",
  "حصّل المبلغ بجهاز الدفع أولاً؛ الموقع لا يخصم من البطاقة.":
    "Collect payment using your card terminal first. This site does not charge cards.",
  "جارٍ حفظ الطلب…": "Saving order…",
  "تأكيد التحصيل وحفظ الطلب ←": "Confirm payment & save order",
  "إجمالي المبيعات": "Total sales",
  "ر.س": "SAR",
  "عدد الطلبات": "Orders",
  "متوسط الطلب": "Average order",
  "المبيعات النقدية": "Cash sales",
  "بطاقة — تحصيل خارجي": "Card — paid externally",
  "مساحة التشغيل": "Operations workspace",
  "◈ نقطة البيع": "◈ Point of sale",
  "☷ الطلبات والتقارير": "☷ Orders & reports",
  "▦ إدارة المنتجات": "▦ Manage products",
  "↗ منيو العملاء": "↗ Customer menu",
  "← الصفحة الموحدة": "← Workspace",
  الفرع: "Branch",
  "بدون فرع": "No branch",
  "تحديث المنتجات": "Refresh products",
  "قائمة المنتجات": "Product menu",
  "↻ تحديث القائمة": "↻ Refresh menu",
  "جارٍ تحميل القائمة…": "Loading menu…",
  "لا توجد أصناف متاحة. أضفها أو فعّلها من":
    "No available products. Add or enable them in",
  "إدارة المنيو": "Menu management",
  "الطلب الحالي": "Current order",
  "اختر صنفًا لبدء طلب جديد": "Choose a product to start an order",
  ملاحظات: "Notes",
  الإجمالي: "Total",
  "الأسعار النهائية من المنيو. إيصال غير ضريبي.":
    "Final menu prices. Non-tax receipt.",
  "تاريخ المبيعات": "Sales date",
  "تصدير CSV ↓": "Export CSV ↓",
  "بتوقيت الرياض": "Riyadh time",
  "جارٍ تحميل الطلبات…": "Loading orders…",
  الطلب: "Order",
  الوقت: "Time",
  النوع: "Type",
  الإيصال: "Receipt",
  "عرض وطباعة": "View & print",
  "لا توجد طلبات لهذا التاريخ والفرع.": "No orders for this date and branch.",
  "قائمة واحدة للمنيو والكاشير · حفظ سحابي مرتبط بالمطعم والفرع":
    "One menu for customers and cashier · Cloud records by restaurant and branch",
  "إغلاق ×": "Close ×",
  "طباعة الإيصال": "Print receipt",
  "إيصال بيع غير ضريبي": "Non-tax sales receipt",
  "الإجمالي (ر.س)": "Total (SAR)",
  "شكرًا لزيارتكم": "Thank you for visiting",
  "في الطلب": "in order",
  "تجاوزت النتائج ١٠٠٠ طلب. الأرقام والتصدير أدناه تخص أحدث ١٠٠٠ طلب فقط.":
    "More than 1,000 orders. Totals and exports below cover the latest 1,000 only.",
};
function Cashier() {
  const [lang, setLang] = useState<"ar" | "en">(() =>
    localStorage.getItem("tito-pos-lang") === "en" ? "en" : "ar",
  );
  const [cartOpen, setCartOpen] = useState(false);
  const t = (value: string) =>
    lang === "en"
      ? value.replace(value.trim(), POS_EN[value.trim()] || value.trim())
      : value;
  const locale = lang === "en" ? "en-SA" : "ar-SA";
  const money = (minor: number) =>
    (minor / 100).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const productName = (p: Product) =>
    lang === "en" ? p.nameEn || p.nameAr : p.nameAr;
  const categoryLabel = (key: string) => {
    const names: Record<string, [string, string]> = {
      __all: ["الكل", "All"],
      juice: ["عصائر", "Juices"],
      hot: ["مشروبات ساخنة", "Hot drinks"],
      cold: ["مشروبات باردة", "Cold drinks"],
      special_menu: ["مشروبات مميزة", "Specials"],
      dessert: ["حلويات", "Desserts"],
      sandwich: ["ساندويتشات", "Sandwiches"],
    };
    return names[key]?.[lang === "en" ? 1 : 0] || key;
  };
  const rid = getCurrentRestaurantId()!,
    [products, P] = useState<Product[]>([]),
    [branches, H] = useState<Branch[]>([]),
    [branch, V] = useState(""),
    [cart, C] = useState<Record<string, number>>({}),
    [search, S] = useState(""),
    [category, K] = useState("__all"),
    [tab, T] = useState("sale"),
    [payment, Y] = useState("cash"),
    [service, G] = useState("takeaway"),
    [note, Q] = useState(""),
    [orders, O] = useState<Order[]>([]),
    [date, D] = useState(today()),
    [truncated, U] = useState(false),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [loading, L] = useState(true),
    [receipt, R] = useState<Order | null>(null);
  const inflight = useRef(false),
    requestId = useRef<string | null>(null);
  const slug = getCurrentRestaurantSlug() || DEFAULT_SLUG;
  async function api(path: string, data?: unknown) {
    const r = await fetch(`/api/restaurants/${rid}/pos/${path}`, {
      method: data ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        "Content-Type": "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const j = await r.json();
    if (!r.ok) throw Error(j.error || t("تعذر إكمال العملية"));
    return j;
  }
  async function catalog() {
    L(true);
    try {
      const j = await api("catalog");
      P(j.products);
      H(j.branches);
      V((old) =>
        j.branches.some((b: Branch) => b.id === old)
          ? old
          : j.branches[0]?.id || "",
      );
      E("");
    } catch (e) {
      E((e as Error).message);
    } finally {
      L(false);
    }
  }
  useEffect(() => {
    void catalog();
  }, []);
  useEffect(() => {
    if (tab === "sale") return;
    let cancelled = false;
    L(true);
    api(`orders?date=${date}${branch ? "&branchId=" + branch : ""}`)
      .then((j) => {
        if (!cancelled) {
          O(j.orders);
          U(j.truncated);
          E("");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          O([]);
          E(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) L(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, date, branch]);
  const lines = Object.entries(cart)
      .map(([id, qty]) => ({ ...products.find((p) => p.id === id)!, qty }))
      .filter((x) => x.id),
    total = lines.reduce((s, x) => s + Math.round(x.price * 100) * x.qty, 0),
    sum = orders.reduce((s, o) => s + o.totalMinor, 0);
  function change(id: string, delta: number) {
    if (inflight.current) return;
    requestId.current = null;
    C((prev) => {
      const next = {
        ...prev,
        [id]: Math.max(0, Math.min(999, (prev[id] || 0) + delta)),
      };
      if (!next[id]) delete next[id];
      return next;
    });
  }
  async function checkout() {
    if (inflight.current || !lines.length) return;
    inflight.current = true;
    B(true);
    E("");
    requestId.current ||= crypto.randomUUID();
    try {
      const o = await api("orders", {
        requestId: requestId.current,
        branchId: branch || null,
        items: lines.map((x) => ({ id: x.id, qty: x.qty })),
        payment,
        service,
        note,
      });
      R(o);
      setCartOpen(false);
      C({});
      Q("");
      requestId.current = null;
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
      inflight.current = false;
    }
  }
  function exportCsv() {
    const rows = [
      [t("رقم الطلب"), t("تاريخ"), t("الدفع"), t("الإجمالي ر.س")],
      ...orders.map((o) => [
        o.id,
        o.createdAt,
        o.payment === "cash" ? t("نقدي") : t("بطاقة"),
        (o.totalMinor / 100).toFixed(2),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          "\ufeff" +
            rows
              .map((r) =>
                r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","),
              )
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `TITO-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="tito-shell" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <aside className="tito-side">
        <a className="tito-brand" href="/dashboard" dir="ltr">
          TITO <span>POS</span>
        </a>
        <p>
          {t(
            "\u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u062A\u0634\u063A\u064A\u0644",
          )}
        </p>
        <button
          className={tab === "sale" ? "on" : ""}
          onClick={() => T("sale")}
        >
          {t("\u25C8 \u0646\u0642\u0637\u0629 \u0627\u0644\u0628\u064A\u0639")}
        </button>
        <button
          className={tab === "orders" ? "on" : ""}
          onClick={() => T("orders")}
        >
          {t(
            "\u2637 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0648\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631",
          )}
        </button>
        <a href="/admin">
          {t(
            "\u25A6 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A",
          )}
        </a>
        <a href={slug === DEFAULT_SLUG ? "/" : `/r/${slug}`}>
          {t(
            "\u2197 \u0645\u0646\u064A\u0648 \u0627\u0644\u0639\u0645\u0644\u0627\u0621",
          )}
        </a>
        <a href="/dashboard">
          {t(
            "\u2190 \u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0645\u0648\u062D\u062F\u0629",
          )}
        </a>
      </aside>
      <main className="tito-main">
        <header>
          <div>
            <small>TITO WORKSPACE / OPERATIONS</small>
            <h1>{tab === "sale" ? t("نقطة البيع") : t("الطلبات والتقارير")}</h1>
          </div>
          <button
            className="tito-language"
            onClick={() => {
              const next = lang === "ar" ? "en" : "ar";
              setLang(next);
              localStorage.setItem("tito-pos-lang", next);
            }}
            aria-label={
              lang === "ar" ? "Switch to English" : t("التبديل إلى العربية")
            }
          >
            {lang === "ar" ? "English" : t("العربية")}
          </button>
          <label>
            {t("\u0627\u0644\u0641\u0631\u0639")}{" "}
            <select
              value={branch}
              disabled={busy}
              onChange={(e) => {
                V(e.target.value);
                requestId.current = null;
              }}
            >
              {!branches.length && (
                <option value="">
                  {t("\u0628\u062F\u0648\u0646 \u0641\u0631\u0639")}
                </option>
              )}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {lang === "en" ? b.nameEn || b.nameAr : b.nameAr}
                </option>
              ))}
            </select>
          </label>
        </header>
        {error && (
          <div role="alert" className="tito-error">
            {error}
            <button onClick={() => void catalog()}>
              {t(
                "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A",
              )}
            </button>
          </div>
        )}
        {tab === "sale" ? (
          <div className="tito-grid">
            <section>
              <div className="tito-toolbar">
                <h2>
                  {t(
                    "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A",
                  )}
                </h2>
                <input
                  aria-label={t("بحث عن صنف")}
                  placeholder={t("ابحث عن صنف…")}
                  value={search}
                  onChange={(e) => S(e.target.value)}
                />
                <button disabled={busy} onClick={() => void catalog()}>
                  {t(
                    "\u21BB \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
                  )}
                </button>
              </div>
              <div className="tito-chips">
                {["__all", ...new Set(products.map((p) => p.category))].map(
                  (c) => (
                    <button
                      className={c === category ? "on" : ""}
                      key={categoryLabel(c)}
                      onClick={() => K(c)}
                    >
                      {categoryLabel(c)}
                    </button>
                  ),
                )}
              </div>
              {loading ? (
                <p>
                  {t(
                    "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0642\u0627\u0626\u0645\u0629\u2026",
                  )}
                </p>
              ) : (
                <div className="tito-products">
                  {products
                    .filter(
                      (p) =>
                        (category === "__all" || p.category === category) &&
                        (p.nameAr + " " + p.nameEn)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((p, i) => (
                      <button
                        disabled={busy}
                        className="tito-product"
                        key={p.id}
                        onClick={() => change(p.id, 1)}
                      >
                        <div className={"tito-art color-" + (i % 4)}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" />
                          ) : (
                            <span>{productName(p).slice(0, 1)}</span>
                          )}
                          <b>+</b>
                        </div>
                        <small>{categoryLabel(p.category)}</small>
                        <h3>{productName(p)}</h3>
                        <strong>
                          {money(Math.round(p.price * 100))}{" "}
                          <small>{t("\u0631.\u0633")}</small>
                        </strong>
                        {cart[p.id] > 0 && (
                          <em>
                            {cart[p.id]}
                            {t("\u0641\u064A \u0627\u0644\u0637\u0644\u0628")}
                          </em>
                        )}
                      </button>
                    ))}
                </div>
              )}
              {!loading && !products.length && (
                <p className="tito-empty">
                  {t(
                    "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0635\u0646\u0627\u0641 \u0645\u062A\u0627\u062D\u0629. \u0623\u0636\u0641\u0647\u0627 \u0623\u0648 \u0641\u0639\u0651\u0644\u0647\u0627 \u0645\u0646",
                  )}{" "}
                  <a href="/admin">
                    {t(
                      "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u064A\u0648",
                    )}
                  </a>
                  .
                </p>
              )}
            </section>
            <section
              className={"tito-cart" + (cartOpen ? " tito-cart-open" : "")}
              aria-label={t("الطلب الحالي")}
            >
              <button
                className="tito-cart-close"
                onClick={() => setCartOpen(false)}
              >
                {lang === "ar" ? t("العودة للأصناف ×") : "Back to products ×"}
              </button>
              <h2>
                {t(
                  "\u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u062D\u0627\u0644\u064A",
                )}
              </h2>
              <div className="tito-switch">
                {[
                  ["takeaway", t("سفري")],
                  ["dinein", t("محلي")],
                ].map(([id, label]) => (
                  <button
                    disabled={busy}
                    key={id}
                    className={service === id ? "on" : ""}
                    onClick={() => {
                      G(id);
                      requestId.current = null;
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="tito-lines">
                {!lines.length && (
                  <p className="tito-empty">
                    {t(
                      "\u0627\u062E\u062A\u0631 \u0635\u0646\u0641\u064B\u0627 \u0644\u0628\u062F\u0621 \u0637\u0644\u0628 \u062C\u062F\u064A\u062F",
                    )}
                  </p>
                )}
                {lines.map((p) => (
                  <div className="tito-line" key={p.id}>
                    <b>{productName(p)}</b>
                    <strong>{money(Math.round(p.price * 100) * p.qty)}</strong>
                    <div className="tito-quantity">
                      <button disabled={busy} onClick={() => change(p.id, -1)}>
                        −
                      </button>
                      <span>{p.qty}</span>
                      <button disabled={busy} onClick={() => change(p.id, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <label>
                {t("\u0645\u0644\u0627\u062D\u0638\u0627\u062A")}
                <input
                  disabled={busy}
                  placeholder={t("رقم الطاولة / ملاحظات التحضير")}
                  maxLength={300}
                  value={note}
                  onChange={(e) => {
                    Q(e.target.value);
                    requestId.current = null;
                  }}
                />
              </label>
              <div className="tito-total">
                <span>
                  {t("\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A")}
                </span>
                <strong>
                  {money(total)}
                  {t("\u0631.\u0633")}
                </strong>
              </div>
              <div className="tito-switch">
                {[
                  ["cash", t("نقدي")],
                  ["card", t("بطاقة")],
                ].map(([id, label]) => (
                  <button
                    disabled={busy}
                    key={id}
                    className={payment === id ? "on" : ""}
                    onClick={() => {
                      Y(id);
                      requestId.current = null;
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="tito-hint">
                {t(
                  "\u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0646\u0647\u0627\u0626\u064A\u0629 \u0645\u0646 \u0627\u0644\u0645\u0646\u064A\u0648. \u0625\u064A\u0635\u0627\u0644 \u063A\u064A\u0631 \u0636\u0631\u064A\u0628\u064A.",
                )}{" "}
                {payment === "card"
                  ? t(
                      "حصّل المبلغ بجهاز الدفع أولاً؛ الموقع لا يخصم من البطاقة.",
                    )
                  : ""}
              </p>
              <button
                className="tito-primary"
                disabled={busy || !lines.length || loading}
                onClick={checkout}
              >
                {busy ? t("جارٍ حفظ الطلب…") : t("تأكيد التحصيل وحفظ الطلب ←")}
              </button>
            </section>
          </div>
        ) : (
          <>
            <div className="tito-toolbar">
              <label>
                {t(
                  "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A",
                )}{" "}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => D(e.target.value)}
                />
              </label>
              <button onClick={exportCsv} disabled={!orders.length || loading}>
                {t("\u062A\u0635\u062F\u064A\u0631 CSV \u2193")}
              </button>
              <small>
                {t(
                  "\u0628\u062A\u0648\u0642\u064A\u062A \u0627\u0644\u0631\u064A\u0627\u0636",
                )}
              </small>
            </div>
            {truncated && (
              <p className="tito-error">
                {t(
                  "\u062A\u062C\u0627\u0648\u0632\u062A \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0661\u0660\u0660\u0660 \u0637\u0644\u0628. \u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0648\u0627\u0644\u062A\u0635\u062F\u064A\u0631 \u0623\u062F\u0646\u0627\u0647 \u062A\u062E\u0635 \u0623\u062D\u062F\u062B \u0661\u0660\u0660\u0660 \u0637\u0644\u0628 \u0641\u0642\u0637.",
                )}
              </p>
            )}
            <div className="tito-stats">
              {[
                [t("إجمالي المبيعات"), money(sum) + t(" ر.س")],
                [t("عدد الطلبات"), orders.length],
                [
                  t("متوسط الطلب"),
                  money(orders.length ? Math.round(sum / orders.length) : 0) +
                    t(" ر.س"),
                ],
                [
                  t("المبيعات النقدية"),
                  money(
                    orders
                      .filter((o) => o.payment === "cash")
                      .reduce((s, o) => s + o.totalMinor, 0),
                  ) + t(" ر.س"),
                ],
              ].map(([label, v]) => (
                <div key={label}>
                  <p>{label}</p>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            {loading ? (
              <p>
                {t(
                  "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A\u2026",
                )}
              </p>
            ) : (
              <div className="tito-table">
                <table>
                  <thead>
                    <tr>
                      <th>{t("\u0627\u0644\u0637\u0644\u0628")}</th>
                      <th>{t("\u0627\u0644\u0648\u0642\u062A")}</th>
                      <th>{t("\u0627\u0644\u0646\u0648\u0639")}</th>
                      <th>{t("\u0627\u0644\u062F\u0641\u0639")}</th>
                      <th>
                        {t("\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A")}
                      </th>
                      <th>{t("\u0627\u0644\u0625\u064A\u0635\u0627\u0644")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td dir="ltr">#{o.id.slice(0, 8).toUpperCase()}</td>
                        <td>
                          {new Date(o.createdAt).toLocaleTimeString(locale, {
                            timeZone: "Asia/Riyadh",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td>
                          {o.service === "dinein" ? t("محلي") : t("سفري")}
                        </td>
                        <td>{o.payment === "cash" ? t("نقدي") : t("بطاقة")}</td>
                        <td>
                          {money(o.totalMinor)}
                          {t("\u0631.\u0633")}
                        </td>
                        <td>
                          <button onClick={() => R(o)}>
                            {t(
                              "\u0639\u0631\u0636 \u0648\u0637\u0628\u0627\u0639\u0629",
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!orders.length && (
                  <p className="tito-empty">
                    {t(
                      "\u0644\u0627 \u062A\u0648\u062C\u062F \u0637\u0644\u0628\u0627\u062A \u0644\u0647\u0630\u0627 \u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0648\u0627\u0644\u0641\u0631\u0639.",
                    )}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        <footer>
          {t(
            "\u0642\u0627\u0626\u0645\u0629 \u0648\u0627\u062D\u062F\u0629 \u0644\u0644\u0645\u0646\u064A\u0648 \u0648\u0627\u0644\u0643\u0627\u0634\u064A\u0631 \u00B7 \u062D\u0641\u0638 \u0633\u062D\u0627\u0628\u064A \u0645\u0631\u062A\u0628\u0637 \u0628\u0627\u0644\u0645\u0637\u0639\u0645 \u0648\u0627\u0644\u0641\u0631\u0639",
          )}
        </footer>
      </main>
      {tab === "sale" && (
        <button className="tito-mobile-order" onClick={() => setCartOpen(true)}>
          <span>
            {lang === "ar" ? t("عرض الطلب") : "View order"} (
            {lines.reduce((sum, x) => sum + x.qty, 0)})
          </span>
          <strong>
            {money(total)} {t("ر.س")}
          </strong>
        </button>
      )}
      {cartOpen && (
        <button
          className="tito-cart-backdrop"
          aria-label={lang === "ar" ? t("إغلاق الطلب") : "Close order"}
          onClick={() => setCartOpen(false)}
        />
      )}
      {receipt && (
        <div className="tito-overlay">
          <section className="tito-receipt">
            <div className="tito-no-print tito-toolbar">
              <button onClick={() => R(null)}>
                {t("\u0625\u063A\u0644\u0627\u0642 \u00D7")}
              </button>
              <button onClick={() => window.print()}>
                {t(
                  "\u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0625\u064A\u0635\u0627\u0644",
                )}
              </button>
            </div>
            <h2>TITO POS</h2>
            <p>
              {t(
                "\u0625\u064A\u0635\u0627\u0644 \u0628\u064A\u0639 \u063A\u064A\u0631 \u0636\u0631\u064A\u0628\u064A",
              )}
            </p>
            <p>
              {(() => {
                const b = branches.find((b) => b.id === receipt.branchId);
                return lang === "en" ? b?.nameEn || b?.nameAr : b?.nameAr;
              })()}
            </p>
            <p dir="ltr">#{receipt.id.slice(0, 8).toUpperCase()}</p>
            <p>
              {new Date(receipt.createdAt).toLocaleString(locale, {
                timeZone: "Asia/Riyadh",
              })}
            </p>
            <hr />
            {receipt.items.map((x) => (
              <div key={x.id} className="tito-receipt-line">
                <span>
                  {lang === "en" ? x.name_en || x.name_ar : x.name_ar} × {x.qty}
                </span>
                <b>{money(x.price_minor * x.qty)}</b>
              </div>
            ))}
            <hr />
            <div className="tito-receipt-line">
              <b>
                {t(
                  "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A (\u0631.\u0633)",
                )}
              </b>
              <strong>{money(receipt.totalMinor)}</strong>
            </div>
            <p>
              {receipt.payment === "cash"
                ? t("نقدي")
                : t("بطاقة — تحصيل خارجي")}{" "}
              · {receipt.service === "dinein" ? t("محلي") : t("سفري")}
            </p>
            {receipt.note && <p>{receipt.note}</p>}
            <p>
              {t(
                "\u0634\u0643\u0631\u064B\u0627 \u0644\u0632\u064A\u0627\u0631\u062A\u0643\u0645",
              )}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
