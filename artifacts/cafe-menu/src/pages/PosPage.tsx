import { reportPeriod } from "./reportPeriods";
import ReportActions from "./ReportActions";
import DailySalesReport from "./DailySalesReport";
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
import ShiftPanel, { type PosShift, type ShiftSummary } from "./ShiftPanel";
import { toast } from "sonner";
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
type Access = { restaurantId: string; userId: string; manager: boolean };
type HeldOrder = {
  id: string;
  cart: Record<string, number>;
  note: string;
  service: string;
  payment: string;
  branch: string;
  created: string;
};
type Order = {
  subtotalMinor: number | null;
  discountMinor: number;
  discountReason: string;
  cashReceivedMinor: number | null;
  cardPaidMinor: number | null;
  status: string;
  createdBy: string | null;
  voidReason: string | null;
  voidedAt: string | null;
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
    [tab, T] = useState(
      new URLSearchParams(window.location.search).get("tab") === "orders"
        ? "orders"
        : "sale",
    ),
    [payment, Y] = useState("cash"),
    [service, G] = useState("takeaway"),
    [note, Q] = useState(""),
    [orders, O] = useState<Order[]>([]),
    [date, D] = useState(today()),
    [toDate, setToDate] = useState(today()),
    [truncated, U] = useState(false),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [loading, L] = useState(true),
    [receipt, R] = useState<Order | null>(null);
  const [reportRefresh, setReportRefresh] = useState(0);
  const [reportLoadedAt, setReportLoadedAt] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("all");
  const [orderPayment, setOrderPayment] = useState("all");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [cashValue, setCashValue] = useState("");
  const [cardValue, setCardValue] = useState("");
  const [activeShift, setActiveShift] = useState<PosShift | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
  const [shiftHistory, setShiftHistory] = useState<PosShift[]>([]);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [allShifts, setAllShifts] = useState(false);
  const shiftOpenRequest = useRef<string | null>(null);
  const shiftBusyRef = useRef(false);
  const [access, setAccess] = useState<Access | null>(null);
  const [held, setHeld] = useState<HeldOrder[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const draftKey = access ? `tito-held-${rid}-${access.userId}` : null;
  const favoriteKey = access ? `tito-favorites-${rid}-${access.userId}` : null;
  const [favoriteState, setFavoriteState] = useState<{
    key: string | null;
    ids: string[];
  }>({ key: null, ids: [] });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favorites = favoriteState.key === favoriteKey ? favoriteState.ids : [];
  useEffect(() => {
    if (!favoriteKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(favoriteKey) || "[]");
      setFavoriteState({
        key: favoriteKey,
        ids: Array.isArray(saved)
          ? saved.filter((v: unknown) => typeof v === "string")
          : [],
      });
    } catch {
      setFavoriteState({ key: favoriteKey, ids: [] });
    }
    setFavoritesOnly(false);
  }, [favoriteKey]);
  function toggleFavorite(id: string) {
    if (!favoriteKey) return;
    const ids = favorites.includes(id)
      ? favorites.filter((v) => v !== id)
      : [...favorites, id];
    try {
      localStorage.setItem(favoriteKey, JSON.stringify(ids));
      setFavoriteState({ key: favoriteKey, ids });
    } catch {
      toast.error(
        lang === "ar"
          ? "تعذر حفظ المفضلة على هذا الجهاز"
          : "Could not save favorites on this device",
      );
    }
  }

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
      setAccess(j.access);
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
    void loadShifts();
  }, [allShifts]);
  async function loadShifts() {
    setShiftLoading(true);
    try {
      const j = await api("shifts" + (allShifts ? "?all=1" : ""));
      setActiveShift(j.active);
      setShiftSummary(j.summary);
      setShiftHistory(j.history);
      if (j.active) V(j.active.branchId || "");
    } catch (e) {
      E((e as Error).message);
    } finally {
      setShiftLoading(false);
    }
  }
  async function openShift(amount: number) {
    if (shiftBusyRef.current) return false;
    shiftBusyRef.current = true;
    B(true);
    E("");
    shiftOpenRequest.current ||= crypto.randomUUID();
    try {
      const result = await api("shifts/open", {
        requestId: shiftOpenRequest.current,
        branchId: branch || null,
        openingMinor: amount,
      });
      setActiveShift(result);
      V(result.branchId || "");
      shiftOpenRequest.current = null;
      await loadShifts();
      toast.success(text("تم فتح الوردية", "Shift opened"));
      return true;
    } catch (e) {
      E((e as Error).message);
      return false;
    } finally {
      B(false);
      shiftBusyRef.current = false;
    }
  }
  async function closeShift(amount: number, note: string) {
    if (!activeShift || shiftBusyRef.current || busy) return false;
    if (lines.length) {
      E(
        text(
          "احفظ الطلب الحالي أو علّقه أو ألغِه قبل إغلاق الوردية",
          "Save, hold or cancel the current order before closing the shift",
        ),
      );
      return false;
    }
    shiftBusyRef.current = true;
    B(true);
    E("");
    try {
      const result = await api(`shifts/${activeShift.id}/close`, {
        countedMinor: amount,
        note,
      });
      setActiveShift(null);
      setShiftSummary(null);
      await loadShifts();
      toast.success(
        text(
          "تم إغلاق الوردية. فرق الصندوق: ",
          "Shift closed. Cash variance: ",
        ) + money(result.varianceMinor),
      );
      return true;
    } catch (e) {
      E((e as Error).message);
      return false;
    } finally {
      B(false);
      shiftBusyRef.current = false;
    }
  }

  useEffect(() => {
    if (tab !== "orders") return;
    let cancelled = false;
    L(true);
    api(
      `orders?date=${date}${access?.manager ? "&to=" + toDate : ""}${branch ? "&branchId=" + branch : ""}`,
    )
      .then((j) => {
        if (!cancelled) {
          O(j.orders);
          setReportLoadedAt(new Date().toISOString());
          U(j.truncated);
          E("");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          O([]);
          U(false);
          setReportLoadedAt(null);
          E(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) L(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, date, toDate, branch, access?.manager, reportRefresh]);
  useEffect(() => {
    if (!draftKey) return;
    try {
      const value = JSON.parse(localStorage.getItem(draftKey) || "[]");
      setHeld(
        Array.isArray(value)
          ? value
              .filter(
                (x) =>
                  x &&
                  typeof x.id === "string" &&
                  x.cart &&
                  typeof x.cart === "object" &&
                  typeof x.note === "string" &&
                  ["cash", "card", "mixed"].includes(x.payment) &&
                  ["takeaway", "dinein"].includes(x.service) &&
                  typeof x.branch === "string" &&
                  typeof x.created === "string",
              )
              .slice(0, 10)
          : [],
      );
    } catch {
      setHeld([]);
    }
  }, [draftKey]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setCartOpen(false);
        R(null);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  const searchTerm = orderSearch.trim().replace(/^#/, "").toLocaleLowerCase();
  const visibleOrders = orders.filter(
    (o) =>
      (orderStatus === "all" || o.status === orderStatus) &&
      (orderPayment === "all" || o.payment === orderPayment) &&
      (!searchTerm ||
        o.id.toLowerCase().includes(searchTerm) ||
        o.note.toLocaleLowerCase().includes(searchTerm)),
  );
  const paidOrders = orders.filter((o) => o.status !== "voided");
  const productTotals = new Map<
    string,
    {
      id: string;
      nameAr: string;
      nameEn?: string;
      qty: number;
      valueMinor: number;
    }
  >();
  for (const order of paidOrders)
    for (const item of order.items) {
      const row = productTotals.get(item.id) || {
        id: item.id,
        nameAr: item.name_ar,
        nameEn: item.name_en,
        qty: 0,
        valueMinor: 0,
      };
      row.qty += item.qty;
      row.valueMinor += item.qty * item.price_minor;
      productTotals.set(item.id, row);
    }
  const bestSellers = [...productTotals.values()]
    .sort((a, b) => b.qty - a.qty || b.valueMinor - a.valueMinor)
    .slice(0, 20);

  const lines = Object.entries(cart)
      .map(([id, qty]) => ({ ...products.find((p) => p.id === id)!, qty }))
      .filter((x) => x.id),
    subtotal = lines.reduce((s, x) => s + Math.round(x.price * 100) * x.qty, 0),
    discount = access?.manager ? toMinor(discountValue) : 0,
    discountInvalid = !Number.isFinite(discount) || discount > subtotal,
    total = Math.max(0, subtotal - (Number.isFinite(discount) ? discount : 0)),
    cardPaid =
      payment === "card" ? total : payment === "mixed" ? toMinor(cardValue) : 0,
    splitInvalid =
      payment === "mixed" &&
      (!Number.isFinite(cardPaid) || cardPaid <= 0 || cardPaid >= total),
    cashDue = Math.max(0, total - (Number.isFinite(cardPaid) ? cardPaid : 0)),
    received = cashValue.trim() ? toMinor(cashValue) : cashDue,
    tenderInvalid =
      payment !== "card" &&
      (!Number.isFinite(received) ||
        received < cashDue ||
        received > 100000000),
    sum = paidOrders.reduce((s, o) => s + o.totalMinor, 0);
  function toMinor(value: string) {
    const normalized = value
      .trim()
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
      .replace(/[٫,]/g, ".");
    if (!normalized) return 0;
    if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return NaN;
    const n = Math.round(Number(normalized) * 100);
    return Number.isSafeInteger(n) ? n : NaN;
  }
  function resetTender() {
    setDiscountValue("");
    setDiscountReason("");
    setCashValue("");
    setCardValue("");
  }
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
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en);
  function clearCart() {
    if (busy || !lines.length) return;
    if (
      !confirm(
        text(
          "إلغاء الطلب الحالي وإفراغ السلة؟",
          "Cancel the current order and clear the cart?",
        ),
      )
    )
      return;
    C({});
    Q("");
    resetTender();
    requestId.current = null;
  }
  function storeHeld(next: HeldOrder[]) {
    if (!draftKey)
      throw Error(text("انتظر تحميل الحساب", "Wait for your account to load"));
    localStorage.setItem(draftKey, JSON.stringify(next));
    setHeld(next);
  }
  function holdOrder() {
    if (busy || !lines.length) return;
    if (held.length >= 10) {
      E(
        text(
          "يمكن تعليق 10 طلبات فقط على هذا الجهاز",
          "You can hold up to 10 orders on this device",
        ),
      );
      return;
    }
    try {
      storeHeld([
        ...held,
        {
          id: crypto.randomUUID(),
          cart: { ...cart },
          note,
          service,
          payment,
          branch,
          created: new Date().toISOString(),
        },
      ]);
      C({});
      Q("");
      resetTender();
      requestId.current = null;
      setCartOpen(false);
      toast.success(
        text("تم تعليق الطلب على هذا الجهاز", "Order held on this device"),
      );
    } catch {
      E(
        text(
          "تعذر تعليق الطلب. تحقق من مساحة المتصفح",
          "Unable to hold the order. Check browser storage",
        ),
      );
    }
  }
  function restoreHeld(h: HeldOrder) {
    if (busy) return;
    if (
      lines.length &&
      !confirm(
        text(
          "استبدال السلة الحالية بالطلب المعلّق؟",
          "Replace the current cart with the held order?",
        ),
      )
    )
      return;
    const valid = Object.fromEntries(
      Object.entries(h.cart).filter(
        ([id, q]) =>
          products.some((p) => p.id === id) &&
          Number.isInteger(q) &&
          q > 0 &&
          q <= 999,
      ),
    );
    if (!Object.keys(valid).length) {
      E(
        text(
          "أصناف هذا الطلب لم تعد متاحة",
          "The products in this order are no longer available",
        ),
      );
      return;
    }
    if (branches.length && !branches.some((b) => b.id === h.branch)) {
      E(text("فرع الطلب غير متاح", "This order branch is no longer available"));
      return;
    }
    try {
      storeHeld(held.filter((x) => x.id !== h.id));
    } catch {
      E(text("تعذر فتح الطلب المعلّق", "Unable to restore held order"));
      return;
    }
    C(valid);
    Q(h.note);
    resetTender();
    G(h.service);
    Y(h.payment);
    V(h.branch);
    requestId.current = null;
    setCartOpen(true);
    if (Object.keys(valid).length !== Object.keys(h.cart).length)
      toast.warning(
        text(
          "تم استبعاد الأصناف غير المتاحة، والأسعار حسب المنيو الحالي",
          "Unavailable products were excluded. Current menu prices apply",
        ),
      );
    else
      toast.success(
        text(
          "تم فتح الطلب بأسعار المنيو الحالية",
          "Order restored at current menu prices",
        ),
      );
  }
  function deleteHeld(id: string) {
    if (busy || !confirm(text("حذف الطلب المعلّق؟", "Delete this held order?")))
      return;
    try {
      storeHeld(held.filter((x) => x.id !== id));
    } catch {
      E(text("تعذر حذف الطلب المعلّق", "Unable to delete held order"));
    }
  }
  async function voidOrder(o: Order) {
    if (busy || o.status === "voided") return;
    const reason = prompt(
      text(
        "سبب إلغاء الطلب المحفوظ (3 أحرف على الأقل). إرجاع المال يتم خارج النظام.",
        "Reason for voiding this saved order (at least 3 characters). Refund money externally.",
      ),
    );
    if (reason === null) return;
    if (reason.trim().length < 3 || reason.trim().length > 300) {
      E(
        text(
          "أدخل سببًا من 3 إلى 300 حرف",
          "Enter a reason between 3 and 300 characters",
        ),
      );
      return;
    }
    B(true);
    E("");
    try {
      const updated = await api(`orders/${o.id}/void`, {
        reason: reason.trim(),
      });
      O((prev) => prev.map((x) => (x.id === o.id ? updated : x)));
      if (receipt?.id === o.id) R(updated);
      await loadShifts();
      toast.success(
        text(
          "تم إلغاء الطلب واستبعاده من إجمالي المبيعات",
          "Order voided and excluded from sales totals",
        ),
      );
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
    }
  }
  async function checkout() {
    if (inflight.current || !lines.length) return;
    if (!activeShift || shiftLoading) {
      E(
        text(
          "افتح وردية قبل تسجيل البيع",
          "Open a shift before recording a sale",
        ),
      );
      T("shifts");
      return;
    }
    if (discountInvalid || tenderInvalid || splitInvalid) {
      E(
        text(
          "تحقق من الخصم والمبلغ المستلم",
          "Check the discount and cash received",
        ),
      );
      return;
    }
    if (discount > 0 && discountReason.trim().length < 3) {
      E(
        text(
          "أدخل سبب الخصم (3 أحرف على الأقل)",
          "Enter a discount reason (at least 3 characters)",
        ),
      );
      return;
    }
    inflight.current = true;
    B(true);
    E("");
    requestId.current ||= crypto.randomUUID();
    try {
      const o = await api("orders", {
        requestId: requestId.current,
        shiftId: activeShift.id,
        discountMinor: discount,
        discountReason: discountReason.trim(),
        cashReceivedMinor: payment !== "card" ? received : null,
        cardPaidMinor: cardPaid,
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
      resetTender();
      requestId.current = null;
      await loadShifts();
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
      inflight.current = false;
    }
  }
  function cardPart(o: Order) {
    return o.payment === "card"
      ? o.totalMinor
      : o.payment === "mixed"
        ? o.cardPaidMinor || 0
        : 0;
  }
  function cashPart(o: Order) {
    return o.totalMinor - cardPart(o);
  }
  function paymentLabel(method: string) {
    return method === "mixed"
      ? text("نقدي + بطاقة", "Cash + card")
      : method === "cash"
        ? t("نقدي")
        : t("بطاقة");
  }
  function exportCsv() {
    const rows = [
      [
        t("رقم الطلب"),
        t("تاريخ"),
        t("الدفع"),
        t("الإجمالي ر.س"),
        text("الحالة", "Status"),
        text("سبب الإلغاء", "Void reason"),
        text("الجزء النقدي ر.س", "Cash portion SAR"),
        text("جزء البطاقة ر.س", "Card portion SAR"),
        text("قبل الخصم ر.س", "Subtotal SAR"),
        text("الخصم ر.س", "Discount SAR"),
        text("سبب الخصم", "Discount reason"),
        text("المستلم نقدًا ر.س", "Cash received SAR"),
        text("الباقي ر.س", "Change SAR"),
      ],
      ...orders.map((o) => [
        o.id,
        o.createdAt,
        paymentLabel(o.payment),
        (o.totalMinor / 100).toFixed(2),
        o.status === "voided" ? text("ملغى", "Voided") : text("مدفوع", "Paid"),
        o.voidReason || "",
        (cashPart(o) / 100).toFixed(2),
        (cardPart(o) / 100).toFixed(2),
        ((o.subtotalMinor ?? o.totalMinor) / 100).toFixed(2),
        ((o.discountMinor || 0) / 100).toFixed(2),
        o.discountReason || "",
        o.cashReceivedMinor === null
          ? ""
          : (o.cashReceivedMinor / 100).toFixed(2),
        o.cashReceivedMinor === null
          ? ""
          : ((o.cashReceivedMinor - cashPart(o)) / 100).toFixed(2),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          "\ufeff" +
            rows
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
    a.download = `TITO-${date}-${access?.manager ? toDate : date}.csv`;
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
        <button
          className={tab === "shifts" ? "on" : ""}
          onClick={() => {
            T("shifts");
            void loadShifts();
          }}
        >
          {text("◷ الورديات والصندوق", "◷ Shifts & cash drawer")}
        </button>
        <a href={slug === DEFAULT_SLUG ? "/" : `/r/${slug}`}>
          {t(
            "\u2197 \u0645\u0646\u064A\u0648 \u0627\u0644\u0639\u0645\u0644\u0627\u0621",
          )}
        </a>
        <a href="/kitchen">
          {text("المطبخ والتحضير", "Kitchen & preparation")}
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
            <h1>
              {tab === "shifts"
                ? text("الورديات والصندوق", "Shifts & cash drawer")
                : tab === "sale"
                  ? t("نقطة البيع")
                  : t("الطلبات والتقارير")}
            </h1>
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
              disabled={busy || !!activeShift}
              onChange={(e) => {
                shiftOpenRequest.current = null;
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
        {tab !== "shifts" && (
          <div className="tito-shift-banner">
            <span>
              {activeShift
                ? text("وردية مفتوحة", "Shift open") +
                  " #" +
                  activeShift.id.slice(0, 8)
                : text(
                    "لا توجد وردية مفتوحة. افتح وردية قبل حفظ المبيعات.",
                    "No open shift. Open a shift before saving sales.",
                  )}
            </span>
            <button
              disabled={busy}
              onClick={() => {
                T("shifts");
                void loadShifts();
              }}
            >
              {activeShift
                ? text("تفاصيل الوردية", "Shift details")
                : text("فتح وردية", "Open shift")}
            </button>
          </div>
        )}
        {tab === "shifts" ? (
          <ShiftPanel
            lang={lang}
            api={api}
            onChange={loadShifts}
            onBusy={B}
            active={activeShift}
            summary={shiftSummary}
            history={shiftHistory}
            busy={busy}
            loading={shiftLoading}
            manager={!!access?.manager}
            all={allShifts}
            onAll={setAllShifts}
            onRefresh={() => void loadShifts()}
            onOpen={openShift}
            onClose={closeShift}
            money={money}
            toMinor={toMinor}
            branchName={(id) => {
              const b = branches.find((b) => b.id === id);
              return id
                ? lang === "en"
                  ? b?.nameEn || b?.nameAr || id
                  : b?.nameAr || id
                : text("بدون فرع", "No branch");
            }}
          />
        ) : tab === "sale" ? (
          <div className="tito-grid">
            <section>
              <div className="tito-toolbar">
                <h2>
                  {t(
                    "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A",
                  )}
                </h2>
                <input
                  ref={searchRef}
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
              {held.length > 0 && (
                <details className="tito-held">
                  <summary>
                    {text(
                      "طلبات معلّقة على هذا الجهاز",
                      "Held orders on this device",
                    )}{" "}
                    ({held.length})
                  </summary>
                  {held.map((h, i) => (
                    <div className="tito-held-row" key={h.id}>
                      <span>
                        {text("طلب", "Order")} {i + 1} ·{" "}
                        {new Date(h.created).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {Object.values(h.cart).reduce((sum, n) => sum + n, 0)}{" "}
                        {text("أصناف", "items")}
                      </span>
                      <button disabled={busy} onClick={() => restoreHeld(h)}>
                        {text("فتح", "Open")}
                      </button>
                      <button
                        disabled={busy}
                        className="tito-danger"
                        onClick={() => deleteHeld(h.id)}
                      >
                        {text("حذف", "Delete")}
                      </button>
                    </div>
                  ))}
                </details>
              )}
              <div className="tito-toolbar">
                <button
                  aria-pressed={favoritesOnly}
                  onClick={() => {
                    setFavoritesOnly((v) => !v);
                    K("__all");
                  }}
                >
                  {favoritesOnly
                    ? text("عرض جميع الأصناف", "Show all products")
                    : text("★ المفضلة", "★ Favorites")}
                </button>
                <small>
                  {text(
                    "النجمة تحفظ الصنف لهذا الحساب والمطعم على هذا الجهاز",
                    "Stars save products for this account and restaurant on this device",
                  )}
                </small>
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
                        (!favoritesOnly || favorites.includes(p.id)) &&
                        (category === "__all" || p.category === category) &&
                        (p.nameAr + " " + p.nameEn)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((p, i) => (
                      <div className="tito-product-wrap" key={p.id}>
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
                        <button
                          className="tito-favorite-toggle"
                          disabled={!favoriteKey}
                          aria-pressed={favorites.includes(p.id)}
                          aria-label={
                            (favorites.includes(p.id)
                              ? text("إزالة من المفضلة: ", "Remove favorite: ")
                              : text("إضافة للمفضلة: ", "Add favorite: ")) +
                            productName(p)
                          }
                          onClick={() => toggleFavorite(p.id)}
                        >
                          {favorites.includes(p.id) ? "★" : "☆"}
                        </button>
                      </div>
                    ))}
                </div>
              )}
              {!loading &&
                favoritesOnly &&
                !products.some((p) => favorites.includes(p.id)) && (
                  <p className="tito-empty">
                    {text(
                      "لا توجد أصناف مفضلة متاحة. اضغط عرض جميع الأصناف ثم النجمة بجوار الصنف.",
                      "No available favorites. Show all products, then use the star beside a product.",
                    )}
                  </p>
                )}
              {!loading && !products.length && (
                <p className="tito-empty">
                  {text(
                    "لا توجد أصناف متاحة. تواصل مع المدير لتحديث المنيو.",
                    "No available products. Contact your manager to update the menu.",
                  )}
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
              <div className="tito-cart-actions">
                <button
                  disabled={busy || !lines.length || !access}
                  onClick={holdOrder}
                >
                  {text("تعليق الطلب", "Hold order")}
                </button>
                <button
                  className="tito-danger"
                  disabled={busy || !lines.length}
                  onClick={clearCart}
                >
                  {text("إلغاء الطلب", "Cancel order")}
                </button>
              </div>
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
                      <button
                        className="tito-danger"
                        disabled={busy}
                        onClick={() => change(p.id, -p.qty)}
                        aria-label={
                          text("حذف الصنف", "Remove item") +
                          " " +
                          productName(p)
                        }
                      >
                        {text("حذف", "Remove")}
                      </button>
                      <button disabled={busy} onClick={() => change(p.id, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="tito-cart-form">
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
                {access?.manager && (
                  <details className="tito-adjustment">
                    <summary>
                      {text("خصم المدير", "Manager discount")}
                      {discount > 0 ? " · " + money(discount) : ""}
                    </summary>
                    <label>
                      {text("قيمة الخصم (ر.س)", "Discount amount (SAR)")}
                      <input
                        inputMode="decimal"
                        disabled={busy}
                        value={discountValue}
                        placeholder="0.00"
                        onChange={(e) => {
                          setDiscountValue(e.target.value);
                          requestId.current = null;
                        }}
                      />
                    </label>
                    <label>
                      {text("سبب الخصم", "Discount reason")}
                      <input
                        maxLength={300}
                        disabled={busy}
                        value={discountReason}
                        onChange={(e) => {
                          setDiscountReason(e.target.value);
                          requestId.current = null;
                        }}
                      />
                    </label>
                    {discountInvalid && (
                      <p className="tito-status-void">
                        {text(
                          "الخصم غير صالح أو يتجاوز قيمة الطلب",
                          "Invalid discount or amount exceeds subtotal",
                        )}
                      </p>
                    )}
                  </details>
                )}
                {payment === "mixed" && (
                  <div className="tito-split">
                    <label>
                      {text(
                        "المبلغ المحصل بالبطاقة (ر.س)",
                        "Amount collected by card (SAR)",
                      )}
                      <input
                        inputMode="decimal"
                        disabled={busy}
                        value={cardValue}
                        placeholder="0.00"
                        onChange={(e) => {
                          setCardValue(e.target.value);
                          requestId.current = null;
                        }}
                      />
                    </label>
                    {splitInvalid ? (
                      <p className="tito-status-void">
                        {text(
                          "أدخل جزء البطاقة أكبر من صفر وأقل من الإجمالي",
                          "Card portion must be above zero and below the total",
                        )}
                      </p>
                    ) : (
                      <p className="tito-status-paid">
                        {text("المطلوب نقدًا: ", "Cash due: ")}
                        {money(cashDue)} {t("ر.س")}
                      </p>
                    )}
                  </div>
                )}
                {payment !== "card" && (
                  <details className="tito-adjustment">
                    <summary>
                      {text("المبلغ المستلم والباقي", "Cash received & change")}
                    </summary>
                    <label>
                      {text(
                        "المستلم (ر.س) — اتركه فارغًا للمبلغ بالضبط",
                        "Cash received (SAR) — blank means exact payment",
                      )}
                      <input
                        disabled={busy}
                        inputMode="decimal"
                        value={cashValue}
                        placeholder={(cashDue / 100).toFixed(2)}
                        onChange={(e) => {
                          setCashValue(e.target.value);
                          requestId.current = null;
                        }}
                      />
                    </label>
                    {tenderInvalid && (
                      <p className="tito-status-void">
                        {text(
                          "المبلغ المستلم أقل من الإجمالي أو غير صالح",
                          "Cash received is insufficient or invalid",
                        )}
                      </p>
                    )}
                  </details>
                )}
              </div>
              {discount > 0 && !discountInvalid && (
                <div className="tito-amount-row">
                  <span>
                    {text("قبل الخصم", "Subtotal")} {money(subtotal)}
                  </span>
                  <span>
                    {text("خصم", "Discount")} −{money(discount)}
                  </span>
                </div>
              )}
              <div className="tito-total">
                <span>
                  {t("\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A")}
                </span>
                <strong>
                  {money(total)}
                  {t("\u0631.\u0633")}
                </strong>
              </div>
              {payment !== "card" &&
                !tenderInvalid &&
                !splitInvalid &&
                cashValue.trim() && (
                  <div className="tito-change">
                    <span>{text("الباقي للعميل", "Change due")}</span>
                    <strong>
                      {money(received - cashDue)} {t("ر.س")}
                    </strong>
                  </div>
                )}
              <div className="tito-switch">
                {[
                  ["cash", t("نقدي")],
                  ["card", t("بطاقة")],
                  ["mixed", text("تقسيم الدفع", "Split payment")],
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
                {payment !== "cash"
                  ? t(
                      "حصّل المبلغ بجهاز الدفع أولاً؛ الموقع لا يخصم من البطاقة.",
                    )
                  : ""}
              </p>
              <button
                className="tito-primary"
                disabled={
                  busy ||
                  !lines.length ||
                  loading ||
                  !activeShift ||
                  shiftLoading ||
                  discountInvalid ||
                  tenderInvalid ||
                  splitInvalid ||
                  (discount > 0 && discountReason.trim().length < 3)
                }
                onClick={checkout}
              >
                {busy ? t("جارٍ حفظ الطلب…") : t("تأكيد التحصيل وحفظ الطلب ←")}
              </button>
            </section>
          </div>
        ) : (
          <>
            <div className="tito-toolbar">
              {(
                [
                  "today",
                  "yesterday",
                  ...(access?.manager ? ["week", "month"] : []),
                ] as ("today" | "yesterday" | "week" | "month")[]
              ).map((kind) => (
                <button
                  key={kind}
                  disabled={loading}
                  onClick={() => {
                    const period = reportPeriod(today(), kind);
                    D(period.from);
                    setToDate(period.to);
                    setReportRefresh((n) => n + 1);
                  }}
                >
                  {kind === "today"
                    ? text("اليوم", "Today")
                    : kind === "yesterday"
                      ? text("أمس", "Yesterday")
                      : kind === "week"
                        ? text("آخر 7 أيام", "Last 7 days")
                        : text("الشهر الحالي", "This month")}
                </button>
              ))}
              <button
                disabled={loading}
                onClick={() => setReportRefresh((n) => n + 1)}
              >
                {loading
                  ? text("جارٍ التحديث…", "Refreshing…")
                  : text("↻ تحديث الطلبات", "↻ Refresh orders")}
              </button>
              {reportLoadedAt && !loading && !error && (
                <small>
                  {text("آخر تحديث", "Last refreshed")}:{" "}
                  {new Date(reportLoadedAt).toLocaleString(locale, {
                    timeZone: "Asia/Riyadh",
                  })}
                </small>
              )}
            </div>
            <div className="tito-toolbar">
              <label>
                {t(
                  "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A",
                )}{" "}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    D(e.target.value);
                    if (e.target.value > toDate) setToDate(e.target.value);
                  }}
                />
              </label>
              {access?.manager && (
                <label>
                  {text("إلى تاريخ", "To date")}{" "}
                  <input
                    type="date"
                    value={toDate}
                    min={date}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </label>
              )}
              <button onClick={exportCsv} disabled={!orders.length || loading}>
                {t("\u062A\u0635\u062F\u064A\u0631 CSV \u2193")}
              </button>
              <small>
                {t(
                  "\u0628\u062A\u0648\u0642\u064A\u062A \u0627\u0644\u0631\u064A\u0627\u0636",
                )}
              </small>
            </div>
            {access?.manager && !loading && !error && (
              <ReportActions
                orders={orders}
                products={bestSellers}
                lang={lang}
                from={date}
                to={toDate}
                branch={
                  branch
                    ? branches.find((b) => b.id === branch)?.nameAr || branch
                    : text("جميع الفروع", "All branches")
                }
                truncated={truncated}
              />
            )}
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
                [t("عدد الطلبات"), paidOrders.length],
                [
                  text("إجمالي الخصومات", "Total discounts"),
                  money(
                    paidOrders.reduce(
                      (sum, o) => sum + (o.discountMinor || 0),
                      0,
                    ),
                  ) +
                    " " +
                    t("ر.س"),
                ],
                [
                  t("متوسط الطلب"),
                  money(
                    paidOrders.length ? Math.round(sum / paidOrders.length) : 0,
                  ) + t(" ر.س"),
                ],
                [
                  t("المبيعات النقدية"),
                  money(paidOrders.reduce((sum, o) => sum + cashPart(o), 0)) +
                    " " +
                    t("ر.س"),
                ],
                [
                  text("مبيعات البطاقة", "Card sales"),
                  money(paidOrders.reduce((sum, o) => sum + cardPart(o), 0)) +
                    " " +
                    t("ر.س"),
                ],
              ].map(([label, v]) => (
                <div key={label}>
                  <p>{label}</p>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            {access?.manager && !loading && !error && (
              <DailySalesReport
                orders={orders}
                lang={lang}
                money={money}
                from={date}
                to={toDate}
                truncated={truncated}
              />
            )}
            {access?.manager && !loading && !error && (
              <section>
                <h2>
                  {text("الأصناف الأكثر مبيعًا", "Best-selling products")}
                </h2>
                <p>
                  {text(
                    "القيمة قبل خصم الطلب؛ الطلبات الملغاة مستبعدة. عند تجاوز 1000 طلب، النتائج تخص أحدث 1000 فقط.",
                    "Values before order discounts; voided orders excluded. Above 1,000 orders, results cover the latest 1,000 only.",
                  )}
                </p>
                <div className="tito-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{text("الصنف", "Product")}</th>
                        <th>{text("الكمية", "Quantity")}</th>
                        <th>{text("قبل الخصم", "Before discount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bestSellers.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {lang === "ar"
                              ? item.nameAr
                              : item.nameEn || item.nameAr}
                          </td>
                          <td>{item.qty}</td>
                          <td>
                            {money(item.valueMinor)} {t("ر.س")}
                          </td>
                        </tr>
                      ))}
                      {!bestSellers.length && (
                        <tr>
                          <td colSpan={3}>
                            {text(
                              "لا توجد مبيعات في الفترة",
                              "No sales in this period",
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <section aria-label={text("البحث في الطلبات", "Search orders")}>
              <h2>{text("سجل الطلبات", "Order history")}</h2>
              <div className="tito-toolbar">
                <label>
                  {text("رقم الطلب أو الملاحظات", "Order number or notes")}{" "}
                  <input
                    type="search"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder={text(
                      "ابحث برقم الإيصال أو الملاحظات…",
                      "Search receipt number or notes…",
                    )}
                  />
                </label>
                <label>
                  {text("الحالة", "Status")}{" "}
                  <select
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value)}
                  >
                    <option value="all">{text("الكل", "All")}</option>
                    <option value="paid">{text("مدفوع", "Paid")}</option>
                    <option value="voided">{text("ملغى", "Voided")}</option>
                  </select>
                </label>
                <label>
                  {text("الدفع", "Payment")}{" "}
                  <select
                    value={orderPayment}
                    onChange={(e) => setOrderPayment(e.target.value)}
                  >
                    <option value="all">{text("الكل", "All")}</option>
                    <option value="cash">{text("نقدي", "Cash")}</option>
                    <option value="card">{text("بطاقة", "Card")}</option>
                    <option value="mixed">
                      {text("نقدي + بطاقة", "Cash + card")}
                    </option>
                  </select>
                </label>
                <button
                  onClick={() => {
                    setOrderSearch("");
                    setOrderStatus("all");
                    setOrderPayment("all");
                  }}
                >
                  {text("مسح الفلاتر", "Clear filters")}
                </button>
              </div>
              <p>
                {text(
                  "هذه الفلاتر لقائمة الطلبات فقط؛ ملخص المبيعات والتصدير للفترة والفرع المختارين، حتى 1000 طلب.",
                  "These filters apply only to the order list; reports and exports cover the selected period and branch, up to 1,000 orders.",
                )}
              </p>
              {!loading && (
                <small>
                  {text("الطلبات المعروضة", "Orders shown")}:{" "}
                  {visibleOrders.length} / {orders.length}
                </small>
              )}
            </section>
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
                    {visibleOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <span dir="ltr">
                            #{o.id.slice(0, 8).toUpperCase()}
                          </span>
                          <small
                            className={
                              o.status === "voided"
                                ? "tito-status-void"
                                : "tito-status-paid"
                            }
                          >
                            {o.status === "voided"
                              ? text("ملغى", "Voided")
                              : text("مدفوع", "Paid")}
                          </small>
                          {o.voidReason && (
                            <small className="tito-void-reason">
                              {o.voidReason}
                            </small>
                          )}
                        </td>
                        <td>
                          {new Date(o.createdAt).toLocaleString(locale, {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            timeZone: "Asia/Riyadh",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td>
                          {o.service === "dinein" ? t("محلي") : t("سفري")}
                        </td>
                        <td>{paymentLabel(o.payment)}</td>
                        <td>
                          {money(o.totalMinor)}
                          {t("\u0631.\u0633")}
                        </td>
                        <td>
                          {o.status !== "voided" &&
                            access &&
                            (access.manager ||
                              o.createdBy === access.userId) && (
                              <button
                                className="tito-danger"
                                disabled={busy}
                                onClick={() => voidOrder(o)}
                              >
                                {text("إلغاء الطلب", "Void order")}
                              </button>
                            )}
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
                {!visibleOrders.length && (
                  <p className="tito-empty">
                    {text(
                      "لا توجد طلبات تطابق البحث والفلاتر ضمن الفترة والفرع المختارين.",
                      "No orders match the search and filters in the selected period and branch.",
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
            {receipt.status === "voided" && (
              <p className="tito-status-void">
                {text(
                  "طلب ملغى — مستبعد من المبيعات",
                  "VOIDED — excluded from sales",
                )}
                <br />
                {receipt.voidReason}
                <br />
                {receipt.voidedAt &&
                  new Date(receipt.voidedAt).toLocaleString(locale, {
                    timeZone: "Asia/Riyadh",
                  })}
              </p>
            )}
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
            {(receipt.discountMinor || 0) > 0 && (
              <>
                <div className="tito-receipt-line">
                  <span>{text("قبل الخصم", "Subtotal")}</span>
                  <b>
                    {money(
                      receipt.subtotalMinor ??
                        receipt.totalMinor + receipt.discountMinor,
                    )}
                  </b>
                </div>
                <div className="tito-receipt-line">
                  <span>{text("خصم", "Discount")}</span>
                  <b>−{money(receipt.discountMinor)}</b>
                </div>
                {receipt.discountReason && (
                  <p>
                    {text("سبب الخصم: ", "Discount reason: ")}
                    {receipt.discountReason}
                  </p>
                )}
              </>
            )}
            <div className="tito-receipt-line">
              <b>
                {t(
                  "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A (\u0631.\u0633)",
                )}
              </b>
              <strong>{money(receipt.totalMinor)}</strong>
            </div>
            <p>
              {paymentLabel(receipt.payment)} ·{" "}
              {receipt.service === "dinein" ? t("محلي") : t("سفري")}
            </p>
            {receipt.payment === "mixed" && (
              <>
                <div className="tito-receipt-line">
                  <span>{text("الجزء النقدي", "Cash portion")}</span>
                  <b>{money(cashPart(receipt))}</b>
                </div>
                <div className="tito-receipt-line">
                  <span>
                    {text(
                      "جزء البطاقة — تحصيل خارجي",
                      "Card portion — paid externally",
                    )}
                  </span>
                  <b>{money(cardPart(receipt))}</b>
                </div>
              </>
            )}
            {receipt.payment !== "card" &&
              receipt.cashReceivedMinor != null && (
                <>
                  <div className="tito-receipt-line">
                    <span>{text("المبلغ المستلم", "Cash received")}</span>
                    <b>{money(receipt.cashReceivedMinor)}</b>
                  </div>
                  <div className="tito-receipt-line">
                    <span>{text("الباقي", "Change")}</span>
                    <b>
                      {money(receipt.cashReceivedMinor - cashPart(receipt))}
                    </b>
                  </div>
                </>
              )}
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
