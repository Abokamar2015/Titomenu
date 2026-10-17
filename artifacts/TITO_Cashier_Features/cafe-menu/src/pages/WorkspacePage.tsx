import {
  isAuthenticated,
  getCurrentUser,
  getCurrentMembership,
  getCurrentRestaurantId,
  getCurrentRestaurantSlug,
  DEFAULT_SLUG,
} from "@/lib/supabase";
import { LoginScreen } from "./AdminPage";
import { useState } from "react";
export default function WorkspacePage() {
  const [, refresh] = useState(0);
  if (!isAuthenticated())
    return <LoginScreen onLogin={() => refresh((x) => x + 1)} />;
  const rid = getCurrentRestaurantId(),
    user = getCurrentUser(),
    slug = getCurrentRestaurantSlug() || DEFAULT_SLUG;
  return (
    <div
      dir="rtl"
      className="dark min-h-screen bg-background text-foreground p-6 md:p-12"
    >
      <div className="max-w-5xl mx-auto">
        <p className="text-primary font-bold" dir="ltr">
          TITO WORKSPACE
        </p>
        <h1 className="text-3xl font-bold mt-6">
          مرحبًا {user?.name}، كل أدواتك في مكان واحد
        </h1>
        <p className="text-muted-foreground mt-4">
          نفس حساب الدخول، ونفس قائمة الأصناف والأسعار.
        </p>
        <div className="grid sm:grid-cols-2 gap-5 mt-10">
          {[
            ...(rid
              ? [
                  ["الكاشير", "بيع الأصناف وتسجيل التحصيل والمبيعات", "/pos"],
                  ...(user?.is_super_admin ||
                  ["owner", "manager"].includes(
                    getCurrentMembership()?.role || "",
                  )
                    ? [
                        [
                          "إدارة المنيو",
                          "المنتجات والأسعار والتصنيفات والمظهر",
                          "/admin",
                        ],
                      ]
                    : []),
                  [
                    "منيو العملاء",
                    "عرض قائمة مطعمك الحالية",
                    slug === DEFAULT_SLUG ? "/" : `/r/${slug}`,
                  ],
                ]
              : []),
            ...(user?.is_super_admin
              ? [["إدارة المنصة", "المطاعم والفروع وحسابات المستخدمين", "/sa"]]
              : []),
            ["حسابي", "إعدادات الملف الشخصي وكلمة المرور", "/profile"],
          ].map(([title, desc, url]) => (
            <a
              key={url}
              href={url}
              className="rounded-2xl border border-border bg-card p-7 hover:border-primary transition"
            >
              <h2 className="text-xl font-bold">{title} ←</h2>
              <p className="text-muted-foreground mt-3 text-sm">{desc}</p>
            </a>
          ))}
        </div>
        {!rid && (
          <p className="mt-6 text-amber-400">
            اختر المطعم من لوحة المنصة لفتح الكاشير وإدارة المنيو.
          </p>
        )}
      </div>
    </div>
  );
}
