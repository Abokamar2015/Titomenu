import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  Plus, Pencil, Trash2, QrCode as QrCodeIcon, LayoutDashboard,
  Download, Coffee, Search, Save, Loader2, Palette, UtensilsCrossed,
  ImagePlus, X as XIcon, Tag, GripVertical, ArrowUpDown, Printer
} from 'lucide-react';
import {
  fetchMenuItems, createMenuItem, updateMenuItem,
  deleteMenuItem, toggleItemAvailability,
  fetchAdminThemeSettings, saveThemeSetting,
  uploadMenuImage, deleteMenuImage,
  fetchCategories, createCategory, updateCategory, deleteCategory, uploadCategoryImage,
  updateSortOrders,
  login, logout, isAuthenticated,
  getCurrentRestaurantSlug, DEFAULT_SLUG,
  getCurrentUser, getCurrentRestaurantId,
} from '@/lib/supabase';
import AccountMenu from '@/components/AccountMenu';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { MenuItem, MenuItemInsert, ThemeSettings, Category } from '@/lib/supabase';
import { springPresets } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

/* ===================== LOGIN ===================== */
export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) { onLogin(); }
    else { setError(true); setTimeout(() => setError(false), 2000); }
  };
  return (
    <div className="dark min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={springPresets.gentle} className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-2xl p-8 text-center" style={{ boxShadow: '0 8px 30px -6px color-mix(in srgb, var(--primary) 20%, transparent)' }}>
          <div className="w-20 h-20 rounded-full border-2 border-primary flex items-center justify-center mx-auto mb-4 bg-primary/10">
            <span className="text-3xl font-black text-primary">&</span>
          </div>
          <h1 className="text-xl font-bold text-foreground mb-1">& Co. Admin</h1>
          <p className="text-sm text-muted-foreground mb-6">لوحة إدارة المينيو</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} className={`text-center ${error ? 'border-destructive' : ''}`} dir="ltr" autoFocus autoComplete="email" />
            <Input type="password" placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} className={`text-center text-lg tracking-widest ${error ? 'border-destructive' : ''}`} dir="ltr" autoComplete="current-password" />
            {error && <p className="text-xs text-destructive">بيانات الدخول غير صحيحة</p>}
            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">{loading ? 'جارٍ الدخول…' : 'دخول'}</Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

/* ===================== TENANT PATHS ===================== */
// Default restaurant keeps root paths (existing printed QR codes point there);
// other tenants get slug-scoped paths.
function tenantMenuPath(): string {
  const slug = getCurrentRestaurantSlug();
  return slug && slug !== DEFAULT_SLUG ? `/r/${slug}` : '/';
}
function tenantPrintPath(): string {
  const slug = getCurrentRestaurantSlug();
  return slug && slug !== DEFAULT_SLUG
    ? `${import.meta.env.BASE_URL}r/${slug}/print`
    : `${import.meta.env.BASE_URL}print`;
}

/* ===================== QR MODAL ===================== */
function QRModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [menuUrl, setMenuUrl] = useState(window.location.origin + tenantMenuPath());
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => { if (open) generateQR(menuUrl); }, [open]);

  const generateQR = (url: string) => {
    setDataUrl(null);
    QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#E8622A', light: '#0F1F1F' },
    })
      .then(setDataUrl)
      .catch(() => toast.error('فشل توليد QR Code'));
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `${getCurrentRestaurantSlug() ?? 'menu'}-qr.png`;
    link.href = dataUrl;
    link.click();
    toast.success('تم تحميل QR Code!');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dark bg-card border-border max-w-sm text-foreground" dir="rtl">
        <DialogHeader><DialogTitle className="text-foreground flex items-center gap-2"><QrCodeIcon className="w-5 h-5 text-primary" />QR Code المينيو</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground text-xs mb-1.5 block">رابط المينيو</Label>
            <div className="flex gap-2">
              <Input value={menuUrl} onChange={e => setMenuUrl(e.target.value)} dir="ltr" className="text-sm" />
              <Button onClick={() => generateQR(menuUrl)} size="sm" variant="outline" className="border-primary text-primary hover:bg-primary/10 shrink-0">توليد</Button>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="relative rounded-2xl overflow-hidden border border-border bg-[#0F1F1F] p-2 w-[256px] h-[256px] flex items-center justify-center">
              {dataUrl
                ? <img src={dataUrl} alt="QR Code" className="w-[240px] h-[240px]" />
                : <Loader2 className="w-8 h-8 text-primary animate-spin" />}
            </div>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground text-center">
            <p>امسح QR Code بكاميرا الجوال للوصول للمينيو</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleDownload} disabled={!dataUrl} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 w-full">
            <Download className="w-4 h-4" />تحميل QR Code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== THEME TAB ===================== */
const COLOR_OPTIONS = [
  { key: 'bg_color', labelAr: 'لون الخلفية', desc: 'خلفية صفحة المينيو', icon: '🎨' },
  { key: 'card_color', labelAr: 'لون البطاقات', desc: 'خلفية كروت الأصناف', icon: '🃏' },
  { key: 'primary_color', labelAr: 'اللون الرئيسي', desc: 'الأزرار والأسعار والتمييز', icon: '⭐' },
  { key: 'text_color', labelAr: 'لون النصوص', desc: 'لون الخطوط والأسماء', icon: '✍️' },
  { key: 'border_color', labelAr: 'لون الحدود', desc: 'حدود البطاقات والفواصل', icon: '▭' },
] as const;

const PRESET_THEMES = [
  { name: 'داكن كلاسيكي', colors: { bg_color: '#1a1a1a', card_color: '#242424', primary_color: '#E8622A', text_color: '#F0EBE3', border_color: '#333333' } },
  { name: 'بني كافيه', colors: { bg_color: '#1C1410', card_color: '#2A1F18', primary_color: '#C8762A', text_color: '#F5E6D3', border_color: '#3D2B1F' } },
  { name: 'أبيض نظيف', colors: { bg_color: '#FAFAFA', card_color: '#FFFFFF', primary_color: '#E8622A', text_color: '#1A1A1A', border_color: '#E5E5E5' } },
  { name: 'كريمي دافئ', colors: { bg_color: '#FDF6EE', card_color: '#FFFFFF', primary_color: '#C8622A', text_color: '#2C1810', border_color: '#E8D5C0' } },
  { name: 'أخضر طبيعي', colors: { bg_color: '#0F1F18', card_color: '#162418', primary_color: '#3D9970', text_color: '#E8F5EE', border_color: '#1E3328' } },
  { name: 'بنفسجي أنيق', colors: { bg_color: '#0F0F1A', card_color: '#181825', primary_color: '#8B5CF6', text_color: '#EDE9FE', border_color: '#2D2B55' } },
];

function ThemeTab() {
  const [theme, setTheme] = useState<ThemeSettings>({ bg_color: '#1a1a1a', card_color: '#242424', primary_color: '#E8622A', text_color: '#F0EBE3', border_color: '#333333' });
  const [saving, setSaving] = useState(false);
  const [loadingTheme, setLoadingTheme] = useState(true);

  useEffect(() => {
    fetchAdminThemeSettings().then(t => { setTheme(t); setLoadingTheme(false); }).catch(() => setLoadingTheme(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(Object.entries(theme).map(([key, value]) => saveThemeSetting(key, value)));
      toast.success('تم حفظ الألوان! ستظهر التغييرات على المينيو فوراً ✓');
    } catch {
      toast.error('فشل حفظ الألوان');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: typeof PRESET_THEMES[number]) => {
    setTheme(preset.colors);
    toast.info(`تم تطبيق ثيم "${preset.name}" — اضغط حفظ للتأكيد`);
  };

  if (loadingTheme) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><span>✨</span> ثيمات جاهزة</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PRESET_THEMES.map(preset => (
            <button key={preset.name} onClick={() => applyPreset(preset)}
              className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-primary transition-all bg-card hover:bg-primary/5 text-start">
              <div className="flex gap-1 shrink-0">
                {[preset.colors.bg_color, preset.colors.primary_color, preset.colors.card_color].map((c, i) => (
                  <div key={i} className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-xs text-foreground font-medium truncate">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><span>🎨</span> تخصيص يدوي</h3>
        <div className="space-y-3">
          {COLOR_OPTIONS.map(({ key, labelAr, desc, icon }) => (
            <div key={key} className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3 border border-border">
              <div className="flex items-center gap-3">
                <span className="text-xl">{icon}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{labelAr}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border-2 border-white/20 shadow-inner" style={{ backgroundColor: theme[key as keyof ThemeSettings] }} />
                <input type="color" value={theme[key as keyof ThemeSettings]}
                  onChange={e => setTheme(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent p-0.5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><span>👁️</span> معاينة مباشرة</h3>
        <div className="rounded-2xl p-4 border border-border" style={{ backgroundColor: theme.bg_color }}>
          <div className="rounded-xl p-3 mb-2 border" style={{ backgroundColor: theme.card_color, borderColor: theme.border_color }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold" style={{ color: theme.text_color }}>اسبريسو</div>
                <div className="text-xs" style={{ color: theme.text_color + '99' }}>Espresso</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg border" style={{ backgroundColor: theme.primary_color + '22', borderColor: theme.primary_color + '66' }}>
                <span className="text-sm font-black" style={{ color: theme.primary_color }}>11</span>
                <span className="text-xs ms-0.5" style={{ color: theme.text_color + '88' }}>ر.س</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {['☕ ساخن', '🧊 بارد'].map((t, i) => (
              <div key={t} className="px-3 py-1 rounded-full text-xs border" style={{
                backgroundColor: i === 0 ? theme.primary_color + '22' : 'transparent',
                borderColor: i === 0 ? theme.primary_color : theme.border_color,
                color: i === 0 ? theme.primary_color : theme.text_color + '88',
              }}>{t}</div>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        حفظ وتطبيق الألوان على المينيو
      </Button>
    </div>
  );
}

/* ===================== CATEGORIES TAB ===================== */
function CategoriesTab({
  categories, onRefresh, catFormOpen, setCatFormOpen, catEdit, setCatEdit
}: {
  categories: Category[];
  onRefresh: () => void;
  catFormOpen: boolean;
  setCatFormOpen: (v: boolean) => void;
  catEdit: Category | null;
  setCatEdit: (v: Category | null) => void;
}) {
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ key: '', name_ar: '', name_en: '', icon: '🍽️', image_url: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingCatImg, setUploadingCatImg] = useState(false);
  const catImgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (catEdit) setCatForm({ key: catEdit.key, name_ar: catEdit.name_ar, name_en: catEdit.name_en, icon: catEdit.icon ?? '🍽️', image_url: catEdit.image_url ?? '' });
    else setCatForm({ key: '', name_ar: '', name_en: '', icon: '🍽️', image_url: '' });
  }, [catEdit, catFormOpen]);

  const handleSaveCat = async () => {
    if (!catForm.name_ar || !catForm.name_en) { toast.error('يرجى تعبئة الاسم بالعربي والإنجليزي'); return; }
    if (!catEdit && !catForm.key) { toast.error('يرجى إدخال مفتاح التصنيف'); return; }
    setSaving(true);
    try {
      if (catEdit) {
        await updateCategory(catEdit.key, { name_ar: catForm.name_ar, name_en: catForm.name_en, icon: catForm.icon, image_url: catForm.image_url || null });
        toast.success('تم تحديث التصنيف ✓');
      } else {
        const key = catForm.key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        await createCategory({ key, name_ar: catForm.name_ar, name_en: catForm.name_en, icon: catForm.icon, sort_order: 99, is_active: true, image_url: catForm.image_url || null });
        toast.success('تم إضافة التصنيف ✓');
      }
      onRefresh(); setCatFormOpen(false); setCatEdit(null);
    } catch { toast.error('حدث خطأ، حاول مجدداً'); }
    finally { setSaving(false); }
  };

  const handleDeleteCat = async () => {
    if (!deleteCat) return;
    try { await deleteCategory(deleteCat.key); toast.success('تم حذف التصنيف'); onRefresh(); }
    catch { toast.error('فشل الحذف'); }
    finally { setDeleteCat(null); }
  };

  const ICONS = ['☕', '🧊', '🍰', '🥪', '🥤', '🍵', '🧁', '🍫', '🥗', '🍽️', '🌮', '🍜'];

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {categories.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد تصنيفات بعد</p>
        </div>
      )}
      {categories.map(cat => (
        <motion.div key={cat.key} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
          <span className="text-2xl">{cat.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{cat.name_ar}</p>
            <p className="text-xs text-muted-foreground">{cat.name_en} · <span className="font-mono opacity-60">{cat.key}</span></p>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground"
              onClick={() => { setCatEdit(cat); setCatFormOpen(true); }}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteCat(cat)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </motion.div>
      ))}

      <Dialog open={catFormOpen} onOpenChange={v => { if (!v) { setCatFormOpen(false); setCatEdit(null); } }}>
        <DialogContent className="dark bg-card border-border max-w-sm text-foreground" dir="rtl">
          <DialogHeader><DialogTitle className="text-foreground">{catEdit ? 'تعديل التصنيف' : 'إضافة تصنيف جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">صورة التصنيف (اختياري)</Label>
              {catForm.image_url ? (
                <div className="relative rounded-xl overflow-hidden border border-border group">
                  <img src={catForm.image_url} alt="صورة التصنيف" className="w-full h-28 object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button size="sm" variant="destructive" onClick={() => setCatForm(p => ({ ...p, image_url: '' }))} className="gap-1">
                      <XIcon className="w-3.5 h-3.5" />حذف
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => catImgRef.current?.click()} className="gap-1 bg-white/10 border-white/30 text-white hover:bg-white/20">
                      <ImagePlus className="w-3.5 h-3.5" />تغيير
                    </Button>
                  </div>
                </div>
              ) : (
                <div onClick={() => catImgRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl h-24 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                  {uploadingCatImg
                    ? <><Loader2 className="w-6 h-6 text-primary animate-spin" /><p className="text-xs text-muted-foreground">جاري الرفع...</p></>
                    : <><ImagePlus className="w-6 h-6 text-muted-foreground" /><p className="text-xs text-muted-foreground">اضغط لرفع صورة للتصنيف</p></>}
                </div>
              )}
              <input ref={catImgRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingCatImg(true);
                try { const url = await uploadCategoryImage(file); setCatForm(p => ({ ...p, image_url: url })); toast.success('تم رفع الصورة ✓'); }
                catch { toast.error('فشل رفع الصورة'); }
                finally { setUploadingCatImg(false); }
              }} />
            </div>
            {!catEdit && (
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">مفتاح التصنيف (إنجليزي فقط) *</Label>
                <Input value={catForm.key} onChange={e => setCatForm(p => ({ ...p, key: e.target.value }))} placeholder="juices" dir="ltr" className="font-mono" />
                <p className="text-xs text-muted-foreground mt-1">يُستخدم داخلياً ولا يمكن تغييره لاحقاً</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-muted-foreground text-xs mb-1 block">الاسم بالعربي *</Label><Input value={catForm.name_ar} onChange={e => setCatForm(p => ({ ...p, name_ar: e.target.value }))} placeholder="عصائر" /></div>
              <div><Label className="text-muted-foreground text-xs mb-1 block">الاسم بالإنجليزي *</Label><Input value={catForm.name_en} onChange={e => setCatForm(p => ({ ...p, name_en: e.target.value }))} placeholder="Juices" dir="ltr" /></div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">الأيقونة</Label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(icon => (
                  <button key={icon} onClick={() => setCatForm(p => ({ ...p, icon }))}
                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-all ${catForm.icon === icon ? 'border-primary bg-primary/15 scale-110' : 'border-border hover:border-primary/50'}`}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setCatFormOpen(false); setCatEdit(null); }} className="text-muted-foreground">إلغاء</Button>
            <Button onClick={handleSaveCat} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {catEdit ? 'حفظ التعديلات' : 'إضافة التصنيف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCat} onOpenChange={() => setDeleteCat(null)}>
        <AlertDialogContent className="dark bg-card border-border text-foreground" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              هل أنت متأكد من حذف تصنيف <strong className="text-foreground">{deleteCat?.name_ar}</strong>؟<br />
              <span className="text-xs text-amber-400">⚠️ الأصناف المرتبطة به لن تُحذف لكنها لن تظهر في القائمة.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="border-border text-foreground hover:bg-muted">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ===================== ITEM FORM ===================== */
type FormData = {
  name_ar: string; name_en: string;
  description_ar: string; description_en: string;
  price: string; calories: string;
  category: string; is_available: boolean;
  image_url: string | null;
};
const emptyForm: FormData = { name_ar: '', name_en: '', description_ar: '', description_en: '', price: '', calories: '', category: 'hot', is_available: true, image_url: null };

function ItemFormModal({ open, onClose, item, onSave, categories }: { open: boolean; onClose: () => void; item: MenuItem | null; onSave: () => void; categories: Category[] }) {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) setForm({ name_ar: item.name_ar, name_en: item.name_en, description_ar: item.description_ar, description_en: item.description_en, price: String(item.price), calories: item.calories ? String(item.calories) : '', category: item.category, is_available: item.is_available, image_url: item.image_url ?? null });
    else setForm({ ...emptyForm, category: categories[0]?.key ?? 'hot' });
  }, [item, open]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('الصورة يجب أن تكون أقل من 5MB'); return; }
    setUploading(true);
    try { const url = await uploadMenuImage(file); setForm(prev => ({ ...prev, image_url: url })); toast.success('تم رفع الصورة ✓'); }
    catch { toast.error('فشل رفع الصورة'); }
    finally { setUploading(false); }
  };

  const handleRemoveImage = async () => {
    if (form.image_url) { try { await deleteMenuImage(form.image_url); } catch { /* ignore */ } }
    setForm(prev => ({ ...prev, image_url: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.name_ar || !form.name_en || !form.price) { toast.error('يرجى تعبئة الاسم بالعربي والإنجليزي والسعر'); return; }
    setSaving(true);
    try {
      const payload: MenuItemInsert = { name_ar: form.name_ar, name_en: form.name_en, description_ar: form.description_ar, description_en: form.description_en, price: parseFloat(form.price), calories: form.calories ? parseInt(form.calories) : null, category: form.category, is_available: form.is_available, sort_order: 99, image_url: form.image_url };
      if (item) { await updateMenuItem(item.id, payload); toast.success('تم تحديث الصنف ✓'); }
      else { await createMenuItem(payload); toast.success('تم إضافة الصنف ✓'); }
      onSave(); onClose();
    } catch { toast.error('حدث خطأ، حاول مجدداً'); }
    finally { setSaving(false); }
  };

  const f = (k: keyof FormData, v: string | boolean | null) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dark bg-card border-border max-w-lg text-foreground max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle className="text-foreground">{item ? 'تعديل الصنف' : 'إضافة صنف جديد'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-muted-foreground text-xs mb-2 block">صورة الصنف</Label>
            {form.image_url ? (
              <div className="relative rounded-xl overflow-hidden border border-border group">
                <img src={form.image_url} alt="صورة الصنف" className="w-full h-40 object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="destructive" onClick={handleRemoveImage} className="gap-1.5"><XIcon className="w-3.5 h-3.5" />حذف الصورة</Button>
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5 bg-white/10 border-white/30 text-white hover:bg-white/20"><ImagePlus className="w-3.5 h-3.5" />تغيير</Button>
                </div>
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl h-36 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                {uploading
                  ? <><Loader2 className="w-7 h-7 text-primary animate-spin" /><p className="text-xs text-muted-foreground">جاري الرفع...</p></>
                  : <><ImagePlus className="w-7 h-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">اضغط لرفع صورة</p><p className="text-xs text-muted-foreground/60">PNG, JPG حتى 5MB</p></>}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-muted-foreground text-xs mb-1 block">الاسم بالعربي *</Label><Input value={form.name_ar} onChange={e => f('name_ar', e.target.value)} placeholder="اسبريسو" /></div>
            <div><Label className="text-muted-foreground text-xs mb-1 block">الاسم بالإنجليزي *</Label><Input value={form.name_en} onChange={e => f('name_en', e.target.value)} placeholder="Espresso" dir="ltr" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-muted-foreground text-xs mb-1 block">السعر (ر.س) *</Label>
              <Input value={form.price} onChange={e => f('price', e.target.value)} placeholder="15" type="number" min="0" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-1 block">السعرات الحرارية</Label>
              <Input value={form.calories} onChange={e => f('calories', e.target.value)} placeholder="120" type="number" min="0" dir="ltr" />
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs mb-1 block">التصنيف</Label>
            <Select value={form.category} onValueChange={v => f('category', v)}>
              <SelectTrigger className="bg-input border-input text-foreground">
                <SelectValue placeholder="اختر التصنيف" />
              </SelectTrigger>
              <SelectContent className="dark bg-card border-border text-foreground">
                {categories.map(cat => (
                  <SelectItem key={cat.key} value={cat.key} className="text-foreground focus:bg-primary/10 focus:text-foreground">
                    {cat.icon} {cat.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs mb-1 block">الوصف بالعربي</Label>
            <Textarea value={form.description_ar} onChange={e => f('description_ar', e.target.value)} placeholder="وصف قصير للصنف..." className="resize-none" rows={2} />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs mb-1 block">الوصف بالإنجليزي</Label>
            <Textarea value={form.description_en} onChange={e => f('description_en', e.target.value)} placeholder="Short description..." className="resize-none" rows={2} dir="ltr" />
          </div>

          <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3 border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">متاح للطلب</p>
              <p className="text-xs text-muted-foreground">سيظهر هذا الصنف في المينيو</p>
            </div>
            <Switch checked={form.is_available} onCheckedChange={v => f('is_available', v)} />
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground">إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {item ? 'حفظ التعديلات' : 'إضافة الصنف'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== MAIN ADMIN PAGE ===================== */
export default function AdminPage() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTab, setActiveTab] = useState<'menu' | 'categories' | 'theme'>('menu');
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<MenuItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<Category | null>(null);
  const [sortMode, setSortMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [itemsData, catsData] = await Promise.all([fetchMenuItems(), fetchCategories()]);
      setItems(itemsData);
      setCategories(catsData);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (authed) load(); }, [authed]);

  if (!authed) return (
    <LoginScreen onLogin={() => {
      // Super admins without a restaurant membership belong on the platform dashboard.
      const u = getCurrentUser();
      if (u?.is_super_admin && !getCurrentRestaurantId()) {
        window.location.href = `${import.meta.env.BASE_URL}sa`;
        return;
      }
      setAuthed(true);
    }} />
  );

  const filtered = items.filter(item => {
    const matchCat = activeCategory === 'all' || item.category === activeCategory;
    const q = search.toLowerCase();
    return matchCat && (!q || item.name_ar.includes(q) || item.name_en.toLowerCase().includes(q));
  });

  const stats = {
    total: items.length,
    available: items.filter(i => i.is_available).length,
  };

  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) setDragOverId(id);
  };
  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    setItems(prev => {
      const list = [...prev];
      const fromIdx = list.findIndex(i => i.id === draggedId);
      const toIdx = list.findIndex(i => i.id === targetId);
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return list;
    });
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      const catItems = activeCategory === 'all' ? items : items.filter(i => i.category === activeCategory);
      const updates = catItems.map((item, idx) => ({ id: item.id, sort_order: idx + 1 }));
      await updateSortOrders(updates);
      toast.success('تم حفظ الترتيب ✓');
      setSortMode(false);
    } catch { toast.error('فشل حفظ الترتيب'); }
    finally { setSavingOrder(false); }
  };

  const handleToggle = async (item: MenuItem) => {
    setTogglingId(item.id);
    try {
      await toggleItemAvailability(item.id, !item.is_available);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i));
      toast.success(item.is_available ? 'تم إخفاء الصنف' : 'تم تفعيل الصنف');
    } catch { toast.error('حدث خطأ'); }
    finally { setTogglingId(null); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try { await deleteMenuItem(deleteItem.id); setItems(prev => prev.filter(i => i.id !== deleteItem.id)); toast.success('تم حذف الصنف'); }
    catch { toast.error('فشل الحذف'); }
    finally { setDeleteItem(null); }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground" dir="rtl">
      {/* TOPBAR */}
      <header className="sticky top-0 z-30 bg-card/95 border-b border-border px-4 py-3 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary flex items-center justify-center">
            <span className="text-sm font-black text-primary">&</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground leading-none">& Co. Admin</h1>
            <p className="text-[10px] text-muted-foreground">لوحة إدارة المينيو</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="border-primary text-primary hover:bg-primary/10 gap-1.5 text-xs" onClick={() => window.open(tenantPrintPath(), '_blank')}>
            <Printer className="w-3.5 h-3.5" />طباعة المينو
          </Button>
          <Button size="sm" variant="outline" className="border-primary text-primary hover:bg-primary/10 gap-1.5 text-xs" onClick={() => setQrOpen(true)}>
            <QrCodeIcon className="w-3.5 h-3.5" />QR Code
          </Button>
          {(activeTab === 'menu' || activeTab === 'categories') && (
            <Button size="sm" onClick={() => { if (activeTab === 'menu') { setEditItem(null); setFormOpen(true); } else { setCatFormOpen(true); setCatEdit(null); } }} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />{activeTab === 'menu' ? 'إضافة صنف' : 'إضافة تصنيف'}
            </Button>
          )}
          <a href="/dashboard" className="text-sm text-primary px-3">مساحة العمل</a>
          <a href="/pos" className="text-sm text-primary px-3">الكاشير</a>
          <AccountMenu
            onLogout={() => { logout(); setAuthed(false); }}
            extraItems={getCurrentUser()?.is_super_admin ? (
              <DropdownMenuItem onClick={() => { window.location.href = `${import.meta.env.BASE_URL}sa`; }} className="gap-2 text-foreground">
                <LayoutDashboard className="w-4 h-4" />لوحة المنصة
              </DropdownMenuItem>
            ) : undefined}
          />
        </div>
      </header>

      {/* TABS */}
      <div className="border-b border-border bg-card/50 px-4">
        <div className="flex gap-1 max-w-5xl mx-auto">
          {[
            { key: 'menu', label: 'إدارة المينيو', icon: <UtensilsCrossed className="w-4 h-4" /> },
            { key: 'categories', label: 'التصنيفات', icon: <Tag className="w-4 h-4" /> },
            { key: 'theme', label: 'المظهر', icon: <Palette className="w-4 h-4" /> },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as 'menu' | 'categories' | 'theme')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ===== MENU TAB ===== */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'إجمالي الأصناف', value: stats.total, color: 'text-foreground' },
                { label: 'متاح حالياً', value: stats.available, color: 'text-primary' },
                { label: 'التصنيفات', value: categories.length, color: 'text-teal-400' },
                { label: 'غير متاح', value: stats.total - stats.available, color: 'text-muted-foreground' },
              ].map(s => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center">
                  <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {!sortMode && (
                <div className="relative flex-1">
                  <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="بحث بالاسم..." value={search} onChange={e => setSearch(e.target.value)} className="pe-9" />
                </div>
              )}
              <div className="flex gap-2 flex-wrap items-center">
                {[{ key: 'all', icon: '', name_ar: 'الكل' }, ...categories].map(cat => (
                  <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeCategory === cat.key ? 'bg-primary/10 text-primary border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary'}`}>
                    {cat.key === 'all' ? 'الكل' : (cat as Category).icon + ' ' + cat.name_ar}
                  </button>
                ))}
                <div className="h-5 w-px bg-border mx-1" />
                {sortMode ? (
                  <>
                    <Button size="sm" onClick={handleSaveOrder} disabled={savingOrder} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs">
                      {savingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      حفظ الترتيب
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSortMode(false); load(); }} className="text-muted-foreground text-xs">
                      إلغاء
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setSortMode(true)} className="border-border text-muted-foreground hover:text-foreground gap-1.5 text-xs">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    ترتيب الأصناف
                  </Button>
                )}
              </div>
            </div>
            {sortMode && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
                <GripVertical className="w-4 h-4 text-primary shrink-0" />
                <span>اسحب الأصناف لتغيير ترتيبها، ثم اضغط <strong className="text-primary">حفظ الترتيب</strong></span>
              </div>
            )}

            {loading ? (
              <div className="space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {sortMode && <th className="py-3 px-2 w-8" />}
                        <th className="text-end py-3 px-4 font-semibold text-muted-foreground">الصنف</th>
                        {!sortMode && <th className="text-end py-3 px-4 font-semibold text-muted-foreground">الفئة</th>}
                        <th className="text-end py-3 px-4 font-semibold text-muted-foreground">السعر</th>
                        {!sortMode && <th className="text-end py-3 px-4 font-semibold text-muted-foreground">السعرات</th>}
                        {!sortMode && <th className="text-center py-3 px-4 font-semibold text-muted-foreground">الحالة</th>}
                        {!sortMode && <th className="text-center py-3 px-4 font-semibold text-muted-foreground">إجراءات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr><td colSpan={6} className="py-12 text-center text-muted-foreground"><Coffee className="w-8 h-8 mx-auto mb-2 opacity-40" /><p>لا توجد أصناف</p></td></tr>
                      )}
                      {filtered.map(item => {
                        const cat = categories.find(c => c.key === item.category);
                        const isDragging = draggedId === item.id;
                        const isDragOver = dragOverId === item.id;
                        return (
                          <tr key={item.id}
                            draggable={sortMode}
                            onDragStart={() => sortMode && handleDragStart(item.id)}
                            onDragOver={e => sortMode && handleDragOver(e, item.id)}
                            onDrop={() => sortMode && handleDrop(item.id)}
                            onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                            className={`border-b border-border/50 transition-all ${sortMode ? 'cursor-grab active:cursor-grabbing' : 'hover:bg-muted/20'} ${isDragging ? 'opacity-40 scale-[0.99]' : ''} ${isDragOver ? 'bg-primary/8 border-primary/40' : ''}`}
                            style={{ borderTopWidth: isDragOver ? '2px' : undefined, borderTopColor: isDragOver ? 'var(--primary)' : undefined }}>
                            {sortMode && (
                              <td className="py-3 px-2 text-center">
                                <GripVertical className="w-4 h-4 text-muted-foreground mx-auto" />
                              </td>
                            )}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {item.image_url && <img src={item.image_url} alt={item.name_ar} className="w-8 h-8 rounded-lg object-cover border border-border shrink-0" />}
                                <div>
                                  <div className="font-semibold text-foreground">{item.name_ar}</div>
                                  <div className="text-xs text-muted-foreground">{item.name_en}</div>
                                </div>
                              </div>
                            </td>
                            {!sortMode && <td className="py-3 px-4"><span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{cat?.icon ?? '📦'} {cat?.name_ar ?? item.category}</span></td>}
                            <td className="py-3 px-4"><span className="font-bold text-primary">{item.price}</span><span className="text-xs text-muted-foreground ms-1">ر.س</span></td>
                            {!sortMode && <td className="py-3 px-4 text-muted-foreground text-xs">{item.calories ? `${item.calories} cal` : '—'}</td>}
                            {!sortMode && <td className="py-3 px-4 text-center"><Switch checked={item.is_available} onCheckedChange={() => handleToggle(item)} disabled={togglingId === item.id} /></td>}
                            {!sortMode && (
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-center gap-2">
                                  <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => { setEditItem(item); setFormOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filtered.length > 0 && <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">عرض {filtered.length} من {items.length} صنف</div>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'categories' && <CategoriesTab categories={categories} onRefresh={load} catFormOpen={catFormOpen} setCatFormOpen={setCatFormOpen} catEdit={catEdit} setCatEdit={setCatEdit} />}
        {activeTab === 'theme' && <ThemeTab />}
      </div>

      <ItemFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditItem(null); }} item={editItem} onSave={load} categories={categories} />
      <QRModal open={qrOpen} onClose={() => setQrOpen(false)} />

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent className="dark bg-card border-border text-foreground" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">هل أنت متأكد من حذف <strong className="text-foreground">{deleteItem?.name_ar}</strong>؟ هذا الإجراء لا يمكن التراجع عنه.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="border-border text-foreground hover:bg-muted">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
