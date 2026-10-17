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
type Branch = { id: string; nameAr: string };
type Order = {
  id: string;
  branchId: string | null;
  items: { id: string; name_ar: string; price_minor: number; qty: number }[];
  totalMinor: number;
  payment: string;
  service: string;
  note: string;
  createdAt: string;
};
const money = (minor: number) =>
  (minor / 100).toLocaleString("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
function Cashier() {
  const rid = getCurrentRestaurantId()!,
    [products, P] = useState<Product[]>([]),
    [branches, H] = useState<Branch[]>([]),
    [branch, V] = useState(""),
    [cart, C] = useState<Record<string, number>>({}),
    [search, S] = useState(""),
    [category, K] = useState("الكل"),
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
    if (!r.ok) throw Error(j.error || "تعذر إكمال العملية");
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
      ["رقم الطلب", "تاريخ", "الدفع", "الإجمالي ر.س"],
      ...orders.map((o) => [
        o.id,
        o.createdAt,
        o.payment === "cash" ? "نقدي" : "بطاقة",
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
    <div className="tito-shell" dir="rtl">
      <aside className="tito-side">
        <a className="tito-brand" href="/dashboard" dir="ltr">
          TITO <span>POS</span>
        </a>
        <p>مساحة التشغيل</p>
        <button
          className={tab === "sale" ? "on" : ""}
          onClick={() => T("sale")}
        >
          ◈ نقطة البيع
        </button>
        <button
          className={tab === "orders" ? "on" : ""}
          onClick={() => T("orders")}
        >
          ☷ الطلبات والتقارير
        </button>
        <a href="/admin">▦ إدارة المنتجات</a>
        <a href={slug === DEFAULT_SLUG ? "/" : `/r/${slug}`}>↗ منيو العملاء</a>
        <a href="/dashboard">← الصفحة الموحدة</a>
      </aside>
      <main className="tito-main">
        <header>
          <div>
            <small>TITO WORKSPACE / OPERATIONS</small>
            <h1>{tab === "sale" ? "نقطة البيع" : "الطلبات والتقارير"}</h1>
          </div>
          <label>
            الفرع{" "}
            <select
              value={branch}
              disabled={busy}
              onChange={(e) => {
                V(e.target.value);
                requestId.current = null;
              }}
            >
              {!branches.length && <option value="">بدون فرع</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr}
                </option>
              ))}
            </select>
          </label>
        </header>
        {error && (
          <div role="alert" className="tito-error">
            {error}
            <button onClick={() => void catalog()}>تحديث المنتجات</button>
          </div>
        )}
        {tab === "sale" ? (
          <div className="tito-grid">
            <section>
              <div className="tito-toolbar">
                <h2>قائمة المنتجات</h2>
                <input
                  aria-label="بحث عن صنف"
                  placeholder="ابحث عن صنف…"
                  value={search}
                  onChange={(e) => S(e.target.value)}
                />
                <button disabled={busy} onClick={() => void catalog()}>
                  ↻ تحديث القائمة
                </button>
              </div>
              <div className="tito-chips">
                {["الكل", ...new Set(products.map((p) => p.category))].map(
                  (c) => (
                    <button
                      className={c === category ? "on" : ""}
                      key={c}
                      onClick={() => K(c)}
                    >
                      {c}
                    </button>
                  ),
                )}
              </div>
              {loading ? (
                <p>جارٍ تحميل القائمة…</p>
              ) : (
                <div className="tito-products">
                  {products
                    .filter(
                      (p) =>
                        (category === "الكل" || p.category === category) &&
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
                            <span>{p.nameAr.slice(0, 1)}</span>
                          )}
                          <b>+</b>
                        </div>
                        <small>{p.category}</small>
                        <h3>{p.nameAr}</h3>
                        <strong>
                          {money(Math.round(p.price * 100))} <small>ر.س</small>
                        </strong>
                        {cart[p.id] > 0 && <em>{cart[p.id]} في الطلب</em>}
                      </button>
                    ))}
                </div>
              )}
              {!loading && !products.length && (
                <p className="tito-empty">
                  لا توجد أصناف متاحة. أضفها أو فعّلها من{" "}
                  <a href="/admin">إدارة المنيو</a>.
                </p>
              )}
            </section>
            <section className="tito-cart">
              <h2>الطلب الحالي</h2>
              <div className="tito-switch">
                {[
                  ["takeaway", "سفري"],
                  ["dinein", "محلي"],
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
                  <p className="tito-empty">اختر صنفًا لبدء طلب جديد</p>
                )}
                {lines.map((p) => (
                  <div className="tito-line" key={p.id}>
                    <b>{p.nameAr}</b>
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
                ملاحظات
                <input
                  disabled={busy}
                  placeholder="رقم الطاولة / ملاحظات التحضير"
                  maxLength={300}
                  value={note}
                  onChange={(e) => {
                    Q(e.target.value);
                    requestId.current = null;
                  }}
                />
              </label>
              <div className="tito-total">
                <span>الإجمالي</span>
                <strong>{money(total)} ر.س</strong>
              </div>
              <div className="tito-switch">
                {[
                  ["cash", "نقدي"],
                  ["card", "بطاقة"],
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
                الأسعار النهائية من المنيو. إيصال غير ضريبي.{" "}
                {payment === "card"
                  ? "حصّل المبلغ بجهاز الدفع أولاً؛ الموقع لا يخصم من البطاقة."
                  : ""}
              </p>
              <button
                className="tito-primary"
                disabled={busy || !lines.length || loading}
                onClick={checkout}
              >
                {busy ? "جارٍ حفظ الطلب…" : "تأكيد التحصيل وحفظ الطلب ←"}
              </button>
            </section>
          </div>
        ) : (
          <>
            <div className="tito-toolbar">
              <label>
                تاريخ المبيعات{" "}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => D(e.target.value)}
                />
              </label>
              <button onClick={exportCsv} disabled={!orders.length || loading}>
                تصدير CSV ↓
              </button>
              <small>بتوقيت الرياض</small>
            </div>
            {truncated && (
              <p className="tito-error">
                تجاوزت النتائج ١٠٠٠ طلب. الأرقام والتصدير أدناه تخص أحدث ١٠٠٠
                طلب فقط.
              </p>
            )}
            <div className="tito-stats">
              {[
                ["إجمالي المبيعات", money(sum) + " ر.س"],
                ["عدد الطلبات", orders.length],
                [
                  "متوسط الطلب",
                  money(orders.length ? Math.round(sum / orders.length) : 0) +
                    " ر.س",
                ],
                [
                  "المبيعات النقدية",
                  money(
                    orders
                      .filter((o) => o.payment === "cash")
                      .reduce((s, o) => s + o.totalMinor, 0),
                  ) + " ر.س",
                ],
              ].map(([label, v]) => (
                <div key={label}>
                  <p>{label}</p>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            {loading ? (
              <p>جارٍ تحميل الطلبات…</p>
            ) : (
              <div className="tito-table">
                <table>
                  <thead>
                    <tr>
                      <th>الطلب</th>
                      <th>الوقت</th>
                      <th>النوع</th>
                      <th>الدفع</th>
                      <th>الإجمالي</th>
                      <th>الإيصال</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td dir="ltr">#{o.id.slice(0, 8).toUpperCase()}</td>
                        <td>
                          {new Date(o.createdAt).toLocaleTimeString("ar-SA", {
                            timeZone: "Asia/Riyadh",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td>{o.service === "dinein" ? "محلي" : "سفري"}</td>
                        <td>{o.payment === "cash" ? "نقدي" : "بطاقة"}</td>
                        <td>{money(o.totalMinor)} ر.س</td>
                        <td>
                          <button onClick={() => R(o)}>عرض وطباعة</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!orders.length && (
                  <p className="tito-empty">
                    لا توجد طلبات لهذا التاريخ والفرع.
                  </p>
                )}
              </div>
            )}
          </>
        )}
        <footer>
          قائمة واحدة للمنيو والكاشير · حفظ سحابي مرتبط بالمطعم والفرع
        </footer>
      </main>
      {receipt && (
        <div className="tito-overlay">
          <section className="tito-receipt">
            <div className="tito-no-print tito-toolbar">
              <button onClick={() => R(null)}>إغلاق ×</button>
              <button onClick={() => window.print()}>طباعة الإيصال</button>
            </div>
            <h2>TITO POS</h2>
            <p>إيصال بيع غير ضريبي</p>
            <p>{branches.find((b) => b.id === receipt.branchId)?.nameAr}</p>
            <p dir="ltr">#{receipt.id.slice(0, 8).toUpperCase()}</p>
            <p>
              {new Date(receipt.createdAt).toLocaleString("ar-SA", {
                timeZone: "Asia/Riyadh",
              })}
            </p>
            <hr />
            {receipt.items.map((x) => (
              <div key={x.id} className="tito-receipt-line">
                <span>
                  {x.name_ar} × {x.qty}
                </span>
                <b>{money(x.price_minor * x.qty)}</b>
              </div>
            ))}
            <hr />
            <div className="tito-receipt-line">
              <b>الإجمالي (ر.س)</b>
              <strong>{money(receipt.totalMinor)}</strong>
            </div>
            <p>
              {receipt.payment === "cash" ? "نقدي" : "بطاقة — تحصيل خارجي"} ·{" "}
              {receipt.service === "dinein" ? "محلي" : "سفري"}
            </p>
            {receipt.note && <p>{receipt.note}</p>}
            <p>شكرًا لزيارتكم</p>
          </section>
        </div>
      )}
    </div>
  );
}
