import {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  FileChartColumn,
  Users,
  Globe,
  Package,
  ChevronDown,
} from "lucide-react";
import {
  getCurrentRestaurantSlug,
  getCurrentUser,
  DEFAULT_SLUG,
} from "@/lib/supabase";
export default function ManagerSidebar({
  lang,
  active,
  mobile = false,
}: {
  lang: string;
  active: string;
  mobile?: boolean;
}) {
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en),
    user = getCurrentUser(),
    slug = getCurrentRestaurantSlug() || DEFAULT_SLUG;
  const links = [
    {
      name: text("الملخص", "Overview"),
      href: "/dashboard",
      key: "overview",
      icon: LayoutDashboard,
    },
    {
      name: text("الكاشير", "Cashier"),
      href: "/pos",
      key: "pos",
      icon: ShoppingCart,
    },
    {
      name: text("الطلبات والتقارير", "Orders & reports"),
      href: "/pos?tab=orders",
      key: "reports",
      icon: FileChartColumn,
    },
    {
      name: text("المطبخ والتحضير", "Kitchen & preparation"),
      href: "/kitchen",
      key: "kitchen",
      icon: UtensilsCrossed,
    },
  ];
  return (
    <aside className={"md-sidebar " + (mobile ? "is-open" : "")}>
      <a className="md-brand" href="/dashboard">
        TITO<span>MANAGER CONSOLE</span>
      </a>
      <div className="md-workspace">
        <small>{text("مساحة العمل", "Workspace")}</small>
        <strong>{slug}</strong>
      </div>
      <nav>
        {links.map((n) => (
          <a
            key={n.key}
            href={n.href}
            className={active === n.key ? "active" : ""}
          >
            <n.icon size={19} />
            {n.name}
          </a>
        ))}
        <details
          className="md-nav-group"
          open={
            active === "items" ||
            active === "suppliers" ||
            active === "stock" ||
            active === "purchases"
              ? true
              : undefined
          }
        >
          <summary>
            <Package size={19} />
            {text("المخزون", "Inventory")}
            <ChevronDown size={14} />
          </summary>
          <a
            className={active === "purchases" ? "active" : ""}
            href="/inventory/purchases"
          >
            {text("استلام المشتريات", "Purchase receipts")}
          </a>
          <a
            className={active === "stock" ? "active" : ""}
            href="/inventory/stock"
          >
            {text("الأرصدة والحركات", "Balances & movements")}
          </a>
          <a
            className={active === "items" ? "active" : ""}
            href="/inventory/items"
          >
            {text("مواد المخزون", "Inventory items")}
          </a>
          <a
            className={active === "suppliers" ? "active" : ""}
            href="/inventory/suppliers"
          >
            {text("الموردون", "Suppliers")}
          </a>
        </details>
        <details className="md-nav-group">
          <summary>
            <UtensilsCrossed size={19} />
            {text("قائمة المنتجات", "Menu catalog")}
            <ChevronDown size={14} />
          </summary>
          <a href="/admin">
            {text("المنتجات والتصنيفات", "Products & categories")}
          </a>
          <a href={slug === DEFAULT_SLUG ? "/" : `/r/${slug}`}>
            <Globe size={15} />
            {text("منيو العملاء", "Customer menu")}
          </a>
        </details>
        {user?.is_super_admin && (
          <a href="/sa">
            <Users size={19} />
            {text("إدارة المنصة", "Platform management")}
          </a>
        )}
      </nav>
      <a className="md-profile" href="/profile">
        <span>{user?.name?.slice(0, 1) || "T"}</span>
        <div>
          <strong>{user?.name}</strong>
          <small>{text("إعدادات حسابي", "My account settings")}</small>
        </div>
      </a>
    </aside>
  );
}
