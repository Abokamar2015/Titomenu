// Platform (super admin) dashboard — Stage 1.
// Overview stats, restaurant management (create / edit / activate / suspend),
// per-restaurant settings (logo, cover, colors, contact) and QR codes.
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  Store, Users, UtensilsCrossed, GitBranch, Plus, Pencil, QrCode,
  Download, Loader2, Search, Power, ExternalLink, Settings2,
  ImagePlus, X as XIcon, LayoutDashboard, Phone,
} from 'lucide-react';
import {
  login, logout, isAuthenticated, getCurrentUser,
  fetchSaStats, fetchSaRestaurants, saCreateRestaurant, saUpdateRestaurant,
  fetchRestaurantSettings, saveRestaurantSetting, uploadImageForRestaurant,
  DEFAULT_SLUG, setCurrentRestaurant,
  type SaStats, type SaRestaurant,
} from '@/lib/supabase';
import AccountMenu from '@/components/AccountMenu';
import { springPresets } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

/* ===================== HELPERS ===================== */

function menuPathFor(slug: string): string {
  return slug === DEFAULT_SLUG ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}r/${slug}`;
}

function menuUrlFor(slug: string): string {
  return window.location.origin + menuPathFor(slug);
}

/* ===================== LOGIN ===================== */

function SaLoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (!res) { setError('بيانات الدخول غير صحيحة'); return; }
    if (!res.user.is_super_admin) {
      logout();
      setError('هذا الحساب ليس حساب مدير منصة');
      return;
    }
    onLogin();
  };
  return (
    <div className="dark min-h-screen bg-background flex items-center justify-center px-4" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={springPresets.gentle} className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-2xl p-8 text-center" style={{ boxShadow: '0 8px 30px -6px color-mix(in srgb, var(--primary) 20%, transparent)' }}>
          <div className="w-20 h-20 rounded-full border-2 border-primary flex items-center justify-center mx-auto mb-4 bg-primary/10">
            <LayoutDashboard className="w-9 h-9 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-1">TitoMenu Platform</h1>
          <p className="text-sm text-muted-foreground mb-6">لوحة إدارة المنصة</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} className={`text-center ${error ? 'border-destructive' : ''}`} dir="ltr" autoFocus autoComplete="email" />
            <Input type="password" placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} className={`text-center text-lg tracking-widest ${error ? 'border-destructive' : ''}`} dir="ltr" autoComplete="current-password" />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">{loading ? 'جارٍ الدخول…' : 'دخول'}</Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

/* ===================== STATS ===================== */

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-black text-foreground leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}{sub ? <span className="text-primary/80"> · {sub}</span> : null}</div>
      </div>
    </div>
  );
}

/* ===================== CREATE RESTAURANT ===================== */

const EMPTY_CREATE = { slug: '', name_ar: '', name_en: '', owner_email: '', owner_password: '', owner_name: '' };

function CreateRestaurantDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = (k: keyof typeof EMPTY_CREATE, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[a-z0-9-]{2,}$/.test(form.slug)) { setError('المعرف (slug) يجب أن يكون حروف إنجليزية صغيرة وأرقام وشرطات فقط'); return; }
    if (form.owner_password.length < 8) { setError('كلمة مرور المالك يجب أن تكون 8 أحرف على الأقل'); return; }
    setSaving(true);
    try {
      await saCreateRestaurant({
        slug: form.slug.trim(), name_ar: form.name_ar.trim(), name_en: form.name_en.trim(),
        owner_email: form.owner_email.trim(), owner_password: form.owner_password,
        owner_name: form.owner_name.trim() || undefined,
      });
      toast.success('تم إنشاء المطعم بنجاح ✓');
      setForm(EMPTY_CREATE);
      onCreated();
      onClose();
    } catch (err) {
      const msg = err instanceof Error && err.message.includes('409') ? 'هذا المعرف (slug) مستخدم بالفعل' : 'فشل إنشاء المطعم';
      setError(msg);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="dark bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle className="text-foreground flex items-center gap-2"><Plus className="w-5 h-5 text-primary" />إضافة مطعم جديد</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-muted-foreground text-xs mb-1 block">الاسم بالعربي *</Label>
              <Input value={form.name_ar} onChange={e => f('name_ar', e.target.value)} required />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-1 block">الاسم بالإنجليزي *</Label>
              <Input value={form.name_en} onChange={e => f('name_en', e.target.value)} dir="ltr" required />
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs mb-1 block">المعرف في الرابط (slug) *</Label>
            <Input value={form.slug} onChange={e => f('slug', e.target.value.toLowerCase())} dir="ltr" placeholder="my-restaurant" required />
            {form.slug && <p className="text-[11px] text-muted-foreground mt-1" dir="ltr">{menuUrlFor(form.slug)}</p>}
          </div>
          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-xs font-bold text-primary">حساب المالك</p>
            <div>
              <Label className="text-muted-foreground text-xs mb-1 block">بريد المالك الإلكتروني *</Label>
              <Input type="email" value={form.owner_email} onChange={e => f('owner_email', e.target.value)} dir="ltr" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">اسم المالك</Label>
                <Input value={form.owner_name} onChange={e => f('owner_name', e.target.value)} />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">كلمة المرور *</Label>
                <Input type="password" value={form.owner_password} onChange={e => f('owner_password', e.target.value)} dir="ltr" autoComplete="new-password" required />
              </div>
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-border">إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء المطعم'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== EDIT RESTAURANT ===================== */

function EditRestaurantDialog({ restaurant, onClose, onSaved }: { restaurant: SaRestaurant | null; onClose: () => void; onSaved: () => void }) {
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (restaurant) { setNameAr(restaurant.name_ar); setNameEn(restaurant.name_en); }
  }, [restaurant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;
    setSaving(true);
    try {
      await saUpdateRestaurant(restaurant.id, { name_ar: nameAr.trim(), name_en: nameEn.trim() });
      toast.success('تم حفظ التعديلات ✓');
      onSaved();
      onClose();
    } catch { toast.error('فشل حفظ التعديلات'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!restaurant} onOpenChange={v => !v && onClose()}>
      <DialogContent className="dark bg-card border-border text-foreground max-w-sm" dir="rtl">
        <DialogHeader><DialogTitle className="text-foreground flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تعديل بيانات المطعم</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-xs mb-1 block">الاسم بالعربي</Label>
            <Input value={nameAr} onChange={e => setNameAr(e.target.value)} required />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs mb-1 block">الاسم بالإنجليزي</Label>
            <Input value={nameEn} onChange={e => setNameEn(e.target.value)} dir="ltr" required />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs mb-1 block">المعرف (slug)</Label>
            <Input value={restaurant?.slug ?? ''} dir="ltr" disabled className="opacity-60" />
            <p className="text-[11px] text-muted-foreground mt-1">لا يمكن تغيير المعرف حفاظًا على روابط QR المطبوعة</p>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-border">إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== RESTAURANT SETTINGS ===================== */

const COLOR_FIELDS = [
  { key: 'bg_color', label: 'الخلفية', fallback: '#1a1a1a' },
  { key: 'card_color', label: 'البطاقات', fallback: '#242424' },
  { key: 'primary_color', label: 'الرئيسي', fallback: '#E8622A' },
  { key: 'text_color', label: 'النصوص', fallback: '#F0EBE3' },
  { key: 'border_color', label: 'الحدود', fallback: '#333333' },
] as const;

const CONTACT_FIELDS = [
  { key: 'contact_phone', label: 'رقم الهاتف', dir: 'ltr', placeholder: '+966…' },
  { key: 'contact_whatsapp', label: 'واتساب', dir: 'ltr', placeholder: '+966…' },
  { key: 'contact_instagram', label: 'إنستغرام', dir: 'ltr', placeholder: '@username' },
  { key: 'contact_tiktok', label: 'تيك توك', dir: 'ltr', placeholder: '@username' },
  { key: 'contact_maps', label: 'رابط الموقع (خرائط جوجل)', dir: 'ltr', placeholder: 'https://maps.app.goo.gl/…' },
] as const;

function ImageField({ label, value, uploading, onUpload, onClear }: {
  label: string; value: string; uploading: boolean;
  onUpload: (file: File) => void; onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label className="text-muted-foreground text-xs mb-1.5 block">{label}</Label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); e.target.value = ''; }} />
      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-border h-24 bg-muted/30">
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <button type="button" onClick={onClear} className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-destructive transition-colors">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full h-24 rounded-xl border border-dashed border-border hover:border-primary/60 text-muted-foreground hover:text-primary flex flex-col items-center justify-center gap-1 text-xs transition-colors">
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ImagePlus className="w-5 h-5" />رفع صورة</>}
        </button>
      )}
    </div>
  );
}

function RestaurantSettingsDialog({ restaurant, onClose }: { restaurant: SaRestaurant | null; onClose: () => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!restaurant) return;
    setLoading(true);
    setDirty(new Set());
    fetchRestaurantSettings(restaurant.id)
      .then(setSettings)
      .catch(() => toast.error('فشل تحميل الإعدادات'))
      .finally(() => setLoading(false));
  }, [restaurant]);

  const set = (key: string, value: string) => {
    setSettings(p => ({ ...p, [key]: value }));
    setDirty(p => new Set(p).add(key));
  };

  const handleUpload = async (key: string, file: File) => {
    if (!restaurant) return;
    setUploadingKey(key);
    try {
      const url = await uploadImageForRestaurant(restaurant.id, file);
      set(key, url);
    } catch { toast.error('فشل رفع الصورة'); }
    finally { setUploadingKey(null); }
  };

  const handleSave = async () => {
    if (!restaurant) return;
    setSaving(true);
    try {
      await Promise.all([...dirty].map(key => saveRestaurantSetting(restaurant.id, key, settings[key] ?? '')));
      toast.success('تم حفظ إعدادات المطعم ✓');
      onClose();
    } catch { toast.error('فشل حفظ الإعدادات'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!restaurant} onOpenChange={v => !v && onClose()}>
      <DialogContent className="dark bg-card border-border text-foreground max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />إعدادات {restaurant?.name_ar}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            {/* Branding */}
            <div className="grid grid-cols-2 gap-3">
              <ImageField label="الشعار (اللوجو)" value={settings['logo_url'] ?? ''} uploading={uploadingKey === 'logo_url'}
                onUpload={file => handleUpload('logo_url', file)} onClear={() => set('logo_url', '')} />
              <ImageField label="صورة الغلاف" value={settings['cover_url'] ?? ''} uploading={uploadingKey === 'cover_url'}
                onUpload={file => handleUpload('cover_url', file)} onClear={() => set('cover_url', '')} />
            </div>
            {/* Description */}
            <div>
              <Label className="text-muted-foreground text-xs mb-1 block">الوصف / الشعار النصي (يظهر تحت اسم المطعم في المينيو)</Label>
              <Input value={settings['description'] ?? ''} onChange={e => set('description', e.target.value)} placeholder="Coffee Shop & Pop Up" />
            </div>
            {/* Colors */}
            <div>
              <p className="text-xs font-bold text-primary mb-2">ألوان المينيو</p>
              <div className="grid grid-cols-5 gap-2">
                {COLOR_FIELDS.map(cf => (
                  <label key={cf.key} className="flex flex-col items-center gap-1.5 cursor-pointer">
                    <span className="w-9 h-9 rounded-lg border-2 border-white/15 shadow-inner relative overflow-hidden" style={{ backgroundColor: settings[cf.key] || cf.fallback }}>
                      <input type="color" value={settings[cf.key] || cf.fallback} onChange={e => set(cf.key, e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer" />
                    </span>
                    <span className="text-[10px] text-muted-foreground">{cf.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {/* Contact */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-primary flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />بيانات التواصل</p>
              {CONTACT_FIELDS.map(cf => (
                <div key={cf.key}>
                  <Label className="text-muted-foreground text-xs mb-1 block">{cf.label}</Label>
                  <Input value={settings[cf.key] ?? ''} onChange={e => set(cf.key, e.target.value)} dir={cf.dir} placeholder={cf.placeholder} />
                </div>
              ))}
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">العنوان</Label>
                <Textarea value={settings['contact_address'] ?? ''} onChange={e => set('contact_address', e.target.value)} rows={2} className="resize-none" />
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-border">إلغاء</Button>
          <Button onClick={handleSave} disabled={saving || loading || dirty.size === 0} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ الإعدادات'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== QR DIALOG ===================== */

function RestaurantQRDialog({ restaurant, onClose }: { restaurant: SaRestaurant | null; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = restaurant ? menuUrlFor(restaurant.slug) : '';

  useEffect(() => {
    if (!restaurant) { setDataUrl(null); return; }
    setDataUrl(null);
    QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#E8622A', light: '#0F1F1F' },
    })
      .then(setDataUrl)
      .catch(() => toast.error('فشل توليد QR Code'));
  }, [restaurant, url]);

  const handleDownload = () => {
    if (!dataUrl || !restaurant) return;
    const link = document.createElement('a');
    link.download = `${restaurant.slug}-menu-qr.png`;
    link.href = dataUrl;
    link.click();
    toast.success('تم تحميل QR Code!');
  };

  return (
    <Dialog open={!!restaurant} onOpenChange={v => !v && onClose()}>
      <DialogContent className="dark bg-card border-border max-w-sm text-foreground" dir="rtl">
        <DialogHeader><DialogTitle className="text-foreground flex items-center gap-2"><QrCode className="w-5 h-5 text-primary" />QR — {restaurant?.name_ar}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground text-center break-all" dir="ltr">{url}</p>
          <div className="flex justify-center">
            <div className="relative rounded-2xl overflow-hidden border border-border bg-[#0F1F1F] p-2 w-[256px] h-[256px] flex items-center justify-center">
              {dataUrl
                ? <img src={dataUrl} alt="QR Code" className="w-[240px] h-[240px]" />
                : <Loader2 className="w-8 h-8 text-primary animate-spin" />}
            </div>
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

/* ===================== RESTAURANT CARD ===================== */

function RestaurantCard({ r, onEdit, onSettings, onQr, onToggle }: {
  r: SaRestaurant;
  onEdit: () => void; onSettings: () => void; onQr: () => void; onToggle: () => void;
}) {
  const owner = r.members.find(m => m.role === 'owner');
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springPresets.gentle}
      className={`bg-card border rounded-2xl p-4 flex flex-col gap-3 ${r.is_active ? 'border-border' : 'border-destructive/40 opacity-75'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground truncate">{r.name_ar}</h3>
          <p className="text-xs text-muted-foreground truncate" dir="ltr">{r.name_en} · /{r.slug}</p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full border shrink-0 ${r.is_active ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-destructive/10 border-destructive/40 text-destructive'}`}>
          {r.is_active ? 'نشط' : 'موقوف'}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><UtensilsCrossed className="w-3.5 h-3.5" />{r.item_count} صنف</span>
        {owner && <span className="flex items-center gap-1 truncate" dir="ltr"><Users className="w-3.5 h-3.5 shrink-0" />{owner.email}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border">
        <Button size="sm" disabled={!r.is_active} onClick={() => { setCurrentRestaurant(r.id, r.slug); window.location.href = '/pos'; }} className="gap-1 text-xs px-3 h-8">الكاشير</Button>
        <Button size="sm" variant="outline" disabled={!r.is_active} onClick={() => { setCurrentRestaurant(r.id, r.slug); window.location.href = '/dashboard'; }} className="gap-1 text-xs px-3 h-8">مساحة العمل</Button>
        <Button size="sm" variant="ghost" onClick={onEdit} className="text-muted-foreground hover:text-foreground gap-1 text-xs px-2 h-8"><Pencil className="w-3.5 h-3.5" />تعديل</Button>
        <Button size="sm" variant="ghost" onClick={onSettings} className="text-muted-foreground hover:text-foreground gap-1 text-xs px-2 h-8"><Settings2 className="w-3.5 h-3.5" />إعدادات</Button>
        <Button size="sm" variant="ghost" onClick={onQr} className="text-muted-foreground hover:text-foreground gap-1 text-xs px-2 h-8"><QrCode className="w-3.5 h-3.5" />QR</Button>
        <div className="ms-auto flex items-center gap-1.5">
          <a href={menuPathFor(r.slug)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary p-1.5" title="فتح المينيو">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <Button size="sm" variant="ghost" onClick={onToggle}
            className={`gap-1 text-xs px-2 h-8 ${r.is_active ? 'text-destructive hover:text-destructive' : 'text-emerald-400 hover:text-emerald-300'}`}>
            <Power className="w-3.5 h-3.5" />{r.is_active ? 'إيقاف' : 'تفعيل'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ===================== PAGE ===================== */

export default function SuperAdminPage() {
  const [authed, setAuthed] = useState(isAuthenticated() && !!getCurrentUser()?.is_super_admin);
  const [stats, setStats] = useState<SaStats | null>(null);
  const [restaurants, setRestaurants] = useState<SaRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SaRestaurant | null>(null);
  const [settingsTarget, setSettingsTarget] = useState<SaRestaurant | null>(null);
  const [qrTarget, setQrTarget] = useState<SaRestaurant | null>(null);
  const [toggleTarget, setToggleTarget] = useState<SaRestaurant | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([fetchSaStats(), fetchSaRestaurants()]);
      setStats(s);
      setRestaurants(r);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (authed) load(); }, [authed]);

  if (!authed) return <SaLoginScreen onLogin={() => setAuthed(true)} />;

  const handleToggle = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      await saUpdateRestaurant(toggleTarget.id, { is_active: !toggleTarget.is_active });
      toast.success(toggleTarget.is_active ? 'تم إيقاف المطعم' : 'تم تفعيل المطعم ✓');
      setToggleTarget(null);
      load();
    } catch { toast.error('فشلت العملية'); }
    finally { setToggling(false); }
  };

  const q = search.trim().toLowerCase();
  const filtered = restaurants.filter(r =>
    !q || r.name_ar.includes(search.trim()) || r.name_en.toLowerCase().includes(q) || r.slug.includes(q),
  );

  return (
    <div className="dark min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/40 flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground leading-tight truncate">TitoMenu Platform</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">لوحة إدارة المنصة</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs h-8">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">مطعم جديد</span>
            </Button>
            <a href="/dashboard" className="text-sm text-primary px-3">مساحة العمل</a>
            <AccountMenu onLogout={() => { logout(); setAuthed(false); }} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Store className="w-5 h-5" />} label="المطاعم" value={stats?.restaurants ?? '—'}
            sub={stats ? `${stats.active_restaurants} نشط` : undefined} />
          <StatCard icon={<Users className="w-5 h-5" />} label="المستخدمون" value={stats?.users ?? '—'} />
          <StatCard icon={<GitBranch className="w-5 h-5" />} label="الفروع" value={stats?.branches ?? '—'} />
          <StatCard icon={<UtensilsCrossed className="w-5 h-5" />} label="أصناف المينيو" value={stats?.menu_items ?? '—'}
            sub={stats ? `${stats.categories} تصنيف` : undefined} />
        </section>

        {/* Restaurants */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-foreground">المطاعم</h2>
            <div className="relative w-56">
              <Search className="w-4 h-4 text-muted-foreground absolute top-1/2 -translate-y-1/2 end-3 pointer-events-none" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث…" className="h-9 text-sm pe-9" />
            </div>
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {restaurants.length === 0 ? 'لا توجد مطاعم بعد — أضف أول مطعم!' : 'لا توجد نتائج للبحث'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(r => (
                <RestaurantCard key={r.id} r={r}
                  onEdit={() => setEditTarget(r)}
                  onSettings={() => setSettingsTarget(r)}
                  onQr={() => setQrTarget(r)}
                  onToggle={() => setToggleTarget(r)} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Dialogs */}
      <CreateRestaurantDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      <EditRestaurantDialog restaurant={editTarget} onClose={() => setEditTarget(null)} onSaved={load} />
      <RestaurantSettingsDialog restaurant={settingsTarget} onClose={() => setSettingsTarget(null)} />
      <RestaurantQRDialog restaurant={qrTarget} onClose={() => setQrTarget(null)} />

      <AlertDialog open={!!toggleTarget} onOpenChange={v => !v && setToggleTarget(null)}>
        <AlertDialogContent className="dark bg-card border-border text-foreground" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {toggleTarget?.is_active ? 'إيقاف المطعم؟' : 'تفعيل المطعم؟'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `سيتم إيقاف «${toggleTarget?.name_ar}» ولن يتمكن الزوار من رؤية المينيو حتى يتم تفعيله مجددًا.`
                : `سيتم تفعيل «${toggleTarget?.name_ar}» وسيصبح المينيو متاحًا للزوار.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="border-border">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggle} disabled={toggling}
              className={toggleTarget?.is_active ? 'bg-destructive text-white hover:bg-destructive/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}>
              {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : (toggleTarget?.is_active ? 'إيقاف' : 'تفعيل')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
