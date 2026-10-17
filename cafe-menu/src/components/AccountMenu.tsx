// Shared account dropdown for admin surfaces (tenant admin + platform admin).
import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { UserCircle, KeyRound, LogOut, Loader2 } from 'lucide-react';
import { getCurrentUser, changePassword } from '@/lib/supabase';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => { setCurrent(''); setNext(''); setConfirm(''); setError(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) { setError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'); return; }
    if (next !== confirm) { setError('تأكيد كلمة المرور غير مطابق'); return; }
    setSaving(true);
    const err = await changePassword(current, next);
    setSaving(false);
    if (err) { setError(err); return; }
    toast.success('تم تغيير كلمة المرور بنجاح');
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="dark bg-card border-border text-foreground max-w-sm" dir="rtl">
        <DialogHeader><DialogTitle className="text-foreground flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" />تغيير كلمة المرور</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">كلمة المرور الحالية</Label>
            <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} dir="ltr" autoComplete="current-password" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">كلمة المرور الجديدة (8 أحرف على الأقل)</Label>
            <Input type="password" value={next} onChange={e => setNext(e.target.value)} dir="ltr" autoComplete="new-password" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">تأكيد كلمة المرور الجديدة</Label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} dir="ltr" autoComplete="new-password" required />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} className="border-border">إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountMenu({ onLogout, extraItems }: { onLogout: () => void; extraItems?: React.ReactNode }) {
  const [, navigate] = useLocation();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const user = getCurrentUser();
  return (
    <>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground gap-1.5 text-xs px-2">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <UserCircle className="w-4 h-4" />
            )}
            <span className="hidden sm:inline max-w-[140px] truncate" dir="ltr">{user?.email ?? 'الحساب'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="dark bg-card border-border min-w-[200px]" align="end">
          <DropdownMenuItem onClick={() => navigate('/profile')} className="gap-2 text-foreground">
            <UserCircle className="w-4 h-4" />الملف الشخصي
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPasswordOpen(true)} className="gap-2 text-foreground">
            <KeyRound className="w-4 h-4" />تغيير كلمة المرور
          </DropdownMenuItem>
          {extraItems}
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem onClick={onLogout} className="gap-2 text-destructive focus:text-destructive">
            <LogOut className="w-4 h-4" />تسجيل الخروج
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}
