import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import {
  getAuthToken,
  isAuthenticated,
  getCurrentRestaurantId,
} from "@/lib/supabase";
import { LoginScreen } from "./AdminPage";
import "./kitchen.css";
type Ticket = {
  id: string;
  branchId: string | null;
  createdAt: string;
  service: string;
  note: string;
  kitchenState: string;
  kitchenChangedAt: string | null;
  items: { id: string; name_ar: string; name_en?: string; qty: number }[];
};
type Event = {
  id: string;
  fromState: string;
  toState: string;
  createdAt: string;
  userName: string;
};
const states = ["new", "preparing", "ready", "completed"];
export default function KitchenPage() {
  const [auth, setAuth] = useState(isAuthenticated());
  if (!auth) return <LoginScreen onLogin={() => setAuth(true)} />;
  if (!getCurrentRestaurantId())
    return (
      <div className="kd-empty" dir="rtl">
        اختر المطعم أولًا من <a href="/dashboard">مساحة العمل</a>
      </div>
    );
  return <KitchenBoard />;
}
function KitchenBoard() {
  const [lang, setLang] = useState<"ar" | "en">("ar"),
    [branch, setBranch] = useState(""),
    [branches, setBranches] = useState<
      { id: string; nameAr: string; nameEn?: string }[]
    >([]);
  const [active, setActive] = useState<Ticket[]>([]),
    [completed, setCompleted] = useState<Ticket[]>([]),
    [tab, setTab] = useState("active"),
    [search, setSearch] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [warning, setWarning] = useState(false),
    [loaded, setLoaded] = useState("");
  const [busy, setBusy] = useState<string | null>(null),
    [history, setHistory] = useState<{ order: string; events: Event[] } | null>(
      null,
    ),
    [historyError, setHistoryError] = useState(""),
    [historyBusy, setHistoryBusy] = useState(false);
  const flight = useRef(false),
    request = useRef<{ id: string; state: string; requestId: string } | null>(
      null,
    ),
    historyVersion = useRef(0);
  const rid = getCurrentRestaurantId(),
    text = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const label = (s: string) =>
    ({
      new: text("جديد", "New"),
      preparing: text("قيد التحضير", "Preparing"),
      ready: text("جاهز", "Ready"),
      completed: text("تم التسليم", "Handed over"),
    })[s] || s;
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
        j.error || text("تعذر تحميل البيانات", "Could not load data"),
      );
    return j;
  }
  useEffect(() => {
    let stop = false;
    const controller = new AbortController();
    api("catalog", undefined, controller.signal)
      .then((j) => {
        if (!stop) setBranches(j.branches);
      })
      .catch((e) => {
        if (!stop) setError(e.message);
      });
    return () => {
      stop = true;
      controller.abort();
    };
  }, [rid]);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setActive([]);
    setCompleted([]);
    async function load() {
      try {
        const j = await api(
          `kitchen${branch ? "?branchId=" + branch : ""}`,
          undefined,
          controller.signal,
        );
        if (!stop) {
          setActive(j.active);
          setCompleted(j.completed);
          setWarning(j.activeTruncated || j.completedTruncated);
          setLoaded(j.serverTime);
          setError("");
        }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      } finally {
        if (!stop) {
          setLoading(false);
          timer = setTimeout(load, 10000);
        }
      }
    }
    void load();
    return () => {
      stop = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [rid, branch, refresh]);
  async function advance(o: Ticket) {
    if (flight.current || error || loading) return;
    const next = states[states.indexOf(o.kitchenState) + 1];
    if (!next) return;
    if (
      next === "completed" &&
      !confirm(
        text(
          "تأكيد تسليم الطلب للعميل؟",
          "Confirm this order was handed to the customer?",
        ),
      )
    )
      return;
    flight.current = true;
    setBusy(o.id);
    setError("");
    if (
      !request.current ||
      request.current.id !== o.id ||
      request.current.state !== o.kitchenState
    )
      request.current = {
        id: o.id,
        state: o.kitchenState,
        requestId: crypto.randomUUID(),
      };
    try {
      await api(`orders/${o.id}/kitchen-state`, {
        requestId: request.current.requestId,
        expected: o.kitchenState,
        next,
      });
      request.current = null;
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      flight.current = false;
      setBusy(null);
      setRefresh((n) => n + 1);
    }
  }
  async function showHistory(o: Ticket) {
    const version = ++historyVersion.current;
    setHistory({ order: o.id, events: [] });
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const j = await api(`orders/${o.id}/kitchen-history`);
      if (version === historyVersion.current)
        setHistory({ order: o.id, events: j.events });
    } catch (e) {
      if (version === historyVersion.current)
        setHistoryError((e as Error).message);
    } finally {
      if (version === historyVersion.current) setHistoryBusy(false);
    }
  }
  const when = (value: string) =>
    new Date(value).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB", {
      timeZone: "Asia/Riyadh",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const tickets = (tab === "completed" ? completed : active).filter(
    (o) =>
      !search.trim() ||
      (
        o.id +
        " " +
        o.note +
        " " +
        o.items.map((i) => i.name_ar + " " + i.name_en).join(" ")
      )
        .toLowerCase()
        .includes(search.trim().replace(/^#/, "").toLowerCase()),
  );
  function card(o: Ticket) {
    const elapsed = Math.max(
      0,
      Math.floor(
        (Date.parse(loaded || new Date().toISOString()) -
          Date.parse(o.createdAt)) /
          60000,
      ),
    );
    return (
      <article className={"kd-ticket state-" + o.kitchenState} key={o.id}>
        <header>
          <strong dir="ltr">#{o.id.slice(0, 8).toUpperCase()}</strong>
          <span>{label(o.kitchenState)}</span>
        </header>
        <div className="kd-ticket-meta">
          <b>
            {o.service === "dinein"
              ? text("محلي", "Dine in")
              : text("سفري", "Takeaway")}
          </b>
          <span>
            {o.branchId
              ? branches.find((b) => b.id === o.branchId)?.nameAr || o.branchId
              : text("بدون فرع", "No branch")}
          </span>
        </div>
        <small>
          {when(o.createdAt)} ·{" "}
          {o.kitchenState === "completed"
            ? text("سُلّم: ", "Handed over: ") +
              (o.kitchenChangedAt ? when(o.kitchenChangedAt) : "—")
            : elapsed + " " + text("دقيقة منذ البيع", "min since sale")}
        </small>
        <ul>
          {o.items.map((i, index) => (
            <li key={i.id + index}>
              <b>{i.qty} ×</b>
              <span>{lang === "ar" ? i.name_ar : i.name_en || i.name_ar}</span>
            </li>
          ))}
        </ul>
        {o.note && (
          <div className="kd-note">
            <b>{text("ملاحظات الطلب", "Order notes")}</b>
            <p>{o.note}</p>
          </div>
        )}
        <footer>
          {o.kitchenState !== "completed" && (
            <button
              className="kd-primary"
              disabled={!!busy || !!error || loading}
              onClick={() => advance(o)}
            >
              {busy === o.id
                ? text("جارٍ الحفظ…", "Saving…")
                : o.kitchenState === "new"
                  ? text("بدء التحضير", "Start preparing")
                  : o.kitchenState === "preparing"
                    ? text("الطلب جاهز", "Mark ready")
                    : text("تأكيد التسليم", "Confirm handover")}
            </button>
          )}
          <button onClick={() => showHistory(o)}>
            {text("سجل الحالة", "Status history")}
          </button>
        </footer>
      </article>
    );
  }
  return (
    <div className="kd-shell" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="kd-top">
        <div>
          <a href="/dashboard" className="kd-brand">
            TITO <span>KITCHEN</span>
          </a>
          <h1>{text("شاشة التحضير", "Preparation board")}</h1>
        </div>
        <nav>
          <a href="/pos">{text("الكاشير", "Cashier")}</a>
          <a href="/dashboard">{text("مساحة العمل", "Workspace")}</a>
          <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </nav>
      </header>
      <section className="kd-toolbar">
        <label>
          {text("الفرع", "Branch")}
          <select
            disabled={!!busy}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="">{text("جميع الفروع", "All branches")}</option>
            {branches.map((b) => (
              <option value={b.id} key={b.id}>
                {lang === "en" ? b.nameEn || b.nameAr : b.nameAr}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text("ابحث عن طلب", "Find an order")}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={text(
              "رقم الطلب، صنف أو ملاحظات…",
              "Order number, item or notes…",
            )}
          />
        </label>
        <button
          disabled={loading || !!busy}
          onClick={() => setRefresh((n) => n + 1)}
        >
          {text("↻ تحديث", "↻ Refresh")}
        </button>
        <small>
          {text(
            "تحديث كل 10 ثوانٍ · توقيت الرياض",
            "Refreshes every 10 seconds · Riyadh time",
          )}
          {loaded && " · " + when(loaded)}
        </small>
      </section>
      <p className="kd-info">
        {text(
          "تعرض هذه الشاشة الطلبات المدفوعة في TITO. الطلبات السابقة لتفعيل شاشة المطبخ لا تُرسل للتحضير من جديد.",
          "This board shows paid TITO orders. Historical orders are not sent for preparation again.",
        )}
      </p>
      <div className="kd-tabs">
        <button
          className={tab === "active" ? "active" : ""}
          onClick={() => setTab("active")}
        >
          {text("الطلبات النشطة", "Active orders")} ({active.length})
        </button>
        <button
          className={tab === "completed" ? "active" : ""}
          onClick={() => setTab("completed")}
        >
          {text("المسلّمة خلال 24 ساعة", "Handed over in 24 hours")} (
          {completed.length})
        </button>
      </div>
      {error && (
        <div className="kd-error" role="alert">
          {error} ·{" "}
          {text(
            "البيانات قديمة؛ تحديث الشاشة مطلوب قبل تغيير الحالات.",
            "Data may be stale; refresh before changing statuses.",
          )}
        </div>
      )}
      {warning && (
        <p className="kd-error">
          {text(
            "توجد أكثر من 100 بطاقة نشطة أو مسلّمة. تظهر أقدم 100 نشطة وأحدث 100 مسلّمة؛ اختر الفرع لتضييق النتائج.",
            "More than 100 active or completed orders. Showing the oldest 100 active and latest 100 completed; select a branch to narrow results.",
          )}
        </p>
      )}
      {loading ? (
        <div className="kd-empty" role="status">
          {text("جارٍ تحميل الطلبات…", "Loading orders…")}
        </div>
      ) : tab === "completed" ? (
        <div className="kd-completed">{tickets.map(card)}</div>
      ) : (
        <div className="kd-columns">
          {states.slice(0, 3).map((s) => (
            <section className="kd-column" key={s}>
              <h2>
                {label(s)}{" "}
                <span>
                  {tickets.filter((o) => o.kitchenState === s).length}
                </span>
              </h2>
              {tickets.filter((o) => o.kitchenState === s).map(card)}
              {!tickets.some((o) => o.kitchenState === s) && (
                <div className="kd-empty">
                  {text("لا توجد طلبات", "No orders")}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {!loading && tab === "completed" && !tickets.length && (
        <div className="kd-empty">
          {text(
            "لا توجد طلبات مسلّمة تطابق البحث",
            "No matching handed-over orders",
          )}
        </div>
      )}
      {history && (
        <div
          className="kd-modal"
          role="dialog"
          aria-modal="true"
          aria-label={text("سجل حالات الطلب", "Order status history")}
        >
          <section>
            <button
              autoFocus
              onClick={() => {
                historyVersion.current++;
                setHistory(null);
              }}
            >
              {text("إغلاق ×", "Close ×")}
            </button>
            <h2>#{history.order.slice(0, 8).toUpperCase()}</h2>
            {historyBusy ? (
              <p>{text("جارٍ التحميل…", "Loading…")}</p>
            ) : historyError ? (
              <p role="alert">{historyError}</p>
            ) : history.events.length ? (
              <ol>
                {history.events.map((e) => (
                  <li key={e.id}>
                    <b>
                      {label(e.fromState)} ← {label(e.toState)}
                    </b>
                    <p>
                      {e.userName} · {when(e.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                {text(
                  "لم تتغير حالة التحضير بعد",
                  "Preparation status has not changed yet",
                )}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
