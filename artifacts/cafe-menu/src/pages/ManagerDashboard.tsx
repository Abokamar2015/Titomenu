import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  FileChartColumn,
  Users,
  ArrowUpLeft,
  RefreshCw,
  Globe,
  Menu,
} from "lucide-react";
import {
  getAuthToken,
  getCurrentRestaurantId,
  getCurrentRestaurantSlug,
  getCurrentUser,
  DEFAULT_SLUG,
} from "@/lib/supabase";
import { managerMetrics, type DashboardOrder } from "./managerMetrics";
import { reportPeriod } from "./reportPeriods";
import "./manager-dashboard.css";
type Branch = { id: string; nameAr: string; nameEn?: string };
const colors = ["#7156d9", "#24a39a", "#f5ad55", "#678ac9", "#bc75b1"];
function riyadhToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export default function ManagerDashboard() {
  const [lang, setLang] = useState<"ar" | "en">("ar"),
    [mobile, setMobile] = useState(false);
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [from, setFrom] = useState(riyadhToday()),
    [to, setTo] = useState(riyadhToday()),
    [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]),
    [orders, setOrders] = useState<DashboardOrder[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [truncated, setTruncated] = useState(false),
    [refresh, setRefresh] = useState(0),
    [loaded, setLoaded] = useState("");
  const rid = getCurrentRestaurantId(),
    user = getCurrentUser(),
    slug = getCurrentRestaurantSlug() || DEFAULT_SLUG;
  const money = (minor: number) =>
    new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-SA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    async function api(path: string) {
      const r = await fetch(`/api/restaurants/${rid}/pos/${path}`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "Unable to load data");
      return j;
    }
    (async () => {
      try {
        const c = await api("catalog");
        if (!c.access?.manager)
          throw Error(
            text("هذه الصفحة للمدير فقط", "This page is for managers only"),
          );
        const data = await api(
          `orders?date=${from}&to=${to}${branch ? "&branchId=" + branch : ""}`,
        );
        if (!cancelled) {
          setBranches(c.branches);
          setOrders(data.orders);
          setTruncated(data.truncated);
          setLoaded(new Date().toISOString());
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setOrders([]);
          setLoaded("");
          setTruncated(false);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [rid, from, to, branch, refresh]);
  const m = managerMetrics(orders),
    payments = [
      { name: text("نقدي", "Cash"), value: m.cash / 100 },
      { name: text("بطاقة", "Card"), value: m.card / 100 },
    ].filter((x) => x.value > 0);
  const nav = [
    {
      name: text("المطبخ والتحضير", "Kitchen & preparation"),
      href: "/kitchen",
      icon: UtensilsCrossed,
    },
    {
      name: text("الملخص", "Overview"),
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    { name: text("الكاشير", "Cashier"), href: "/pos", icon: ShoppingCart },
    {
      name: text("الطلبات والتقارير", "Orders & reports"),
      href: "/pos?tab=orders",
      icon: FileChartColumn,
    },
    {
      name: text("المنتجات والتصنيفات", "Products & categories"),
      href: "/admin",
      icon: UtensilsCrossed,
    },
    {
      name: text("منيو العملاء", "Customer menu"),
      href: slug === DEFAULT_SLUG ? "/" : `/r/${slug}`,
      icon: Globe,
    },
    ...(user?.is_super_admin
      ? [
          {
            name: text("إدارة المنصة", "Platform management"),
            href: "/sa",
            icon: Users,
          },
        ]
      : []),
  ];
  const empty = (
    <p className="md-empty">
      {text(
        "لا توجد مبيعات في الفترة المختارة",
        "No sales in the selected period",
      )}
    </p>
  );
  function chart(title: string, items: { name: string; value: number }[]) {
    return (
      <article className="md-card">
        <h2>{title}</h2>
        {items.length ? (
          <>
            <div className="md-donut">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={items}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={88}
                    paddingAngle={3}
                  >
                    {items.map((x, i) => (
                      <Cell key={x.name} fill={colors[i % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) =>
                      `${v.toFixed(2)} ${text("ر.س", "SAR")}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="md-legend">
              {items.map((x, i) => (
                <li key={x.name}>
                  <span style={{ background: colors[i % colors.length] }} />
                  <b>{x.name}</b>
                  <strong>{money(Math.round(x.value * 100))}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          empty
        )}
      </article>
    );
  }
  return (
    <div className="md-shell" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <aside className={"md-sidebar " + (mobile ? "is-open" : "")}>
        <a className="md-brand" href="/dashboard">
          TITO<span>MANAGER CONSOLE</span>
        </a>
        <div className="md-workspace">
          <small>{text("مساحة العمل", "Workspace")}</small>
          <strong>{slug}</strong>
        </div>
        <nav>
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={n.href === "/dashboard" ? "active" : ""}
            >
              <n.icon size={19} />
              {n.name}
            </a>
          ))}
        </nav>
        <a className="md-profile" href="/profile">
          <span>{user?.name?.slice(0, 1) || "T"}</span>
          <div>
            <strong>{user?.name}</strong>
            <small>{text("إعدادات حسابي", "My account settings")}</small>
          </div>
        </a>
      </aside>
      <main className="md-main">
        <header className="md-topbar">
          <button
            className="md-mobile"
            onClick={() => setMobile(!mobile)}
            aria-label={text("فتح القائمة", "Toggle navigation")}
          >
            <Menu size={20} />
          </button>
          <span>
            {text(
              "نظرة شاملة على نشاط مطعمك",
              "A clear view of your restaurant",
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
              <p>TITO WORKSPACE</p>
              <h1>{text("ملخص الأداء", "Performance overview")}</h1>
              <span>
                {text("مرحبًا", "Welcome")}, {user?.name}.{" "}
                {text(
                  "تابع يومك من مكان واحد.",
                  "Your business, in one place.",
                )}
              </span>
            </div>
            <a className="md-primary" href="/pos">
              {text("فتح الكاشير", "Open cashier")}
              <ArrowUpLeft size={17} />
            </a>
          </div>
          <section className="md-filters">
            <div className="md-presets">
              {(["today", "yesterday", "week", "month"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    const p = reportPeriod(riyadhToday(), k);
                    setFrom(p.from);
                    setTo(p.to);
                  }}
                >
                  {k === "today"
                    ? text("اليوم", "Today")
                    : k === "yesterday"
                      ? text("أمس", "Yesterday")
                      : k === "week"
                        ? text("7 أيام", "7 days")
                        : text("هذا الشهر", "This month")}
                </button>
              ))}
            </div>
            <label>
              {text("من", "From")}
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (e.target.value > to) setTo(e.target.value);
                }}
              />
            </label>
            <label>
              {text("إلى", "To")}
              <input
                type="date"
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              {text("الفرع", "Branch")}
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="">{text("جميع الفروع", "All branches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {lang === "en" ? b.nameEn || b.nameAr : b.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy} onClick={() => setRefresh((v) => v + 1)}>
              <RefreshCw size={16} />
              {text("تحديث", "Refresh")}
            </button>
          </section>
          <div className="md-meta">
            <span>
              {text(
                "بتوقيت الرياض · المبالغ بالريال السعودي",
                "Riyadh time · Amounts in SAR",
              )}
            </span>
            {!busy && loaded && (
              <span>
                {text("آخر تحديث", "Updated")}:{" "}
                {new Date(loaded).toLocaleString(
                  lang === "ar" ? "ar-SA" : "en-GB",
                  { timeZone: "Asia/Riyadh" },
                )}
              </span>
            )}
          </div>
          {error ? (
            <div className="md-error" role="alert">
              {error}
              <button onClick={() => setRefresh((v) => v + 1)}>
                {text("إعادة المحاولة", "Retry")}
              </button>
            </div>
          ) : busy ? (
            <div className="md-loading" role="status">
              {text("جارٍ تحميل بيانات مطعمك…", "Loading restaurant data…")}
            </div>
          ) : (
            <>
              {truncated && (
                <p className="md-warning">
                  {text(
                    "النتائج جزئية: تعرض أحدث 1000 طلب فقط. اختصر الفترة للحصول على تقرير كامل.",
                    "Partial results: latest 1,000 orders only. Shorten the period for a complete report.",
                  )}
                </p>
              )}
              <section className="md-kpis">
                {[
                  [
                    text("صافي المبيعات المسجلة", "Recorded net sales"),
                    money(m.sales),
                    text(
                      "بعد الخصم واستبعاد الملغى",
                      "After discounts, excluding voids",
                    ),
                  ],
                  [
                    text("الطلبات المدفوعة", "Paid orders"),
                    String(m.paid),
                    text("طلبات محفوظة", "Recorded orders"),
                  ],
                  [
                    text("متوسط الطلب", "Average order"),
                    money(m.average),
                    text("للبيع غير الملغى", "Non-voided sales"),
                  ],
                  [
                    text("الخصومات", "Discounts"),
                    money(m.discount),
                    text("خصومات الطلبات المدفوعة", "Paid order discounts"),
                  ],
                  [
                    text("الطلبات الملغاة", "Voided orders"),
                    String(m.voided),
                    text("قيمة ملغاة: ", "Voided value: ") + money(m.voidValue),
                  ],
                ].map(([title, value, sub]) => (
                  <article key={title} className="md-kpi">
                    <p>{title}</p>
                    <strong>{value}</strong>
                    <small>{sub}</small>
                  </article>
                ))}
              </section>
              <article className="md-card md-hourly">
                <div className="md-card-heading">
                  <div>
                    <h2>{text("المبيعات حسب الساعة", "Sales by hour")}</h2>
                    <p>
                      {text(
                        "تجميع ساعات اليوم عبر الفترة المحددة",
                        "Hours aggregated across the selected period",
                      )}
                    </p>
                  </div>
                  <a href="/pos?tab=orders">
                    {text("عرض الطلبات ←", "View orders →")}
                  </a>
                </div>
                {m.paid ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={m.hours}
                      margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#eeeef5"
                      />
                      <XAxis dataKey="hour" fontSize={11} interval={2} />
                      <YAxis fontSize={11} />
                      <Tooltip
                        formatter={(v: number) =>
                          `${v.toFixed(2)} ${text("ر.س", "SAR")}`
                        }
                      />
                      <Bar
                        dataKey="sales"
                        name={text("المبيعات", "Sales")}
                        fill="#7156d9"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  empty
                )}
              </article>
              <section className="md-chart-grid">
                {chart(text("توزيع المدفوعات", "Payment breakdown"), payments)}
                {chart(
                  text(
                    "أعلى المنتجات قبل خصم الطلب",
                    "Top products before order discounts",
                  ),
                  m.products.map((p) => ({
                    name: lang === "ar" ? p.ar : p.en,
                    value: p.gross,
                  })),
                )}
              </section>
              <section className="md-chart-grid">
                {chart(
                  text("المبيعات حسب الفرع", "Sales by branch"),
                  m.branches
                    .filter((b) => b.sales > 0)
                    .map((b) => ({
                      name:
                        b.id === "none"
                          ? text("بدون فرع", "No branch")
                          : (lang === "en"
                              ? branches.find((x) => x.id === b.id)?.nameEn
                              : undefined) ||
                            branches.find((x) => x.id === b.id)?.nameAr ||
                            b.id,
                      value: b.sales,
                    })),
                )}
                <article className="md-card">
                  <h2>{text("أنواع الطلبات", "Order types")}</h2>
                  {[
                    [text("محلي", "Dine in"), m.services.dinein],
                    [text("سفري", "Takeaway"), m.services.takeaway],
                  ].map(([name, count]) => (
                    <div className="md-service" key={name}>
                      <span>{name}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                  <div className="md-note">
                    {text(
                      "هذه اللوحة تعرض المبيعات المسجلة في TITO فقط. الإلغاء ليس مرتجعًا جزئيًا، والمبالغ ليست تقريرًا ضريبيًا. حركات الصندوق والباقي مستبعدة من المبيعات.",
                      "This dashboard covers sales recorded in TITO only. Voids are not partial refunds. This is not a tax report. Drawer movements and change are excluded from sales.",
                    )}
                  </div>
                </article>
              </section>
            </>
          )}
          <footer className="md-footer">
            TITO · {text("لوحة المدير", "Manager Console")}
          </footer>
        </div>
      </main>
    </div>
  );
}
