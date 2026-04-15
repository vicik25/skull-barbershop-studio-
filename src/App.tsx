/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  getDoc,
  setDoc,
  where,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signInWithGoogle, logout } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Scissors, 
  Calendar, 
  Clock, 
  User as UserIcon, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Settings as SettingsIcon,
  LogOut,
  Lock,
  ChevronRight,
  Download,
  ExternalLink,
  Menu,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { format, isToday, parseISO, isWithinInterval, setHours, setMinutes } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import confetti from 'canvas-confetti';

// --- Types ---
interface Booking {
  id: string;
  name: string;
  whatsapp: string;
  service: string;
  date: string;
  time: string;
  status: 'pending' | 'completed' | 'no-show';
  createdAt: any;
  price: number;
}

interface ShopSettings {
  isOpen: boolean;
}

const SERVICES = [
  { name: 'Anak', price: 35000 },
  { name: 'Dewasa', price: 50000 },
  { name: 'Semir Uban', price: 50000 },
  { name: 'Downperm', price: 120000 },
  { name: 'Keratin', price: 200000 },
  { name: 'Perming Curly/Wavy', price: 250000 },
  { name: 'Hairlight', price: 180000 }, // Range 160-200, used avg
  { name: 'Coloring Full', price: 225000 }, // Range 200-250, used avg
  { name: 'Cornrows', price: 400000 }, // Range 300-500, used avg
];

const ADMIN_EMAILS = ["skullstudio09@gmail.com", "viciknopik14@gmail.com"];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [settings, setSettings] = useState<ShopSettings>({ isOpen: true });
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [view, setView] = useState<'customer' | 'admin'>('customer');
  const [lastBooking, setLastBooking] = useState<Booking | null>(null);
  const [showTicket, setShowTicket] = useState(false);

  // --- Auth & Initial Data ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAdmin(u ? ADMIN_EMAILS.includes(u.email || '') : false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      
      // Notification sound for new booking
      if (data.length > bookings.length && bookings.length > 0) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(() => {});
        toast.success('New booking received!');
      }
      
      setBookings(data);
    });
    return () => unsubscribe();
  }, [bookings.length]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'shop'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as ShopSettings);
      } else {
        setDoc(doc(db, 'settings', 'shop'), { isOpen: true });
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Handlers ---
  const handleBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!settings.isOpen) {
      toast.error('Studio is currently closed.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const serviceName = formData.get('service') as string;
    const service = SERVICES.find(s => s.name === serviceName);
    
    const bookingData = {
      name: formData.get('name'),
      whatsapp: formData.get('whatsapp'),
      service: serviceName,
      date: formData.get('date'),
      time: formData.get('time'),
      status: 'pending',
      createdAt: serverTimestamp(),
      price: service?.price || 0
    };

    try {
      const docRef = await addDoc(collection(db, 'bookings'), bookingData);
      const newBooking = { id: docRef.id, ...bookingData } as Booking;
      setLastBooking(newBooking);
      setShowTicket(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#D4AF37', '#B91C1C', '#000000']
      });
      
      // WhatsApp Deep Link
      const message = `Halo Skull Barber Studio! Saya ingin konfirmasi booking:\n\nNama: ${bookingData.name}\nLayanan: ${bookingData.service}\nTanggal: ${bookingData.date}\nJam: ${bookingData.time}\n\nTerima kasih!`;
      const waUrl = `https://wa.me/6285723883091?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
      
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      toast.error('Failed to book. Please try again.');
      console.error(error);
    }
  };

  const updateBookingStatus = async (id: string, status: 'completed' | 'no-show') => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
      toast.success(`Booking marked as ${status}`);
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const toggleShop = async () => {
    try {
      await updateDoc(doc(db, 'settings', 'shop'), { isOpen: !settings.isOpen });
      toast.success(`Studio is now ${!settings.isOpen ? 'OPEN' : 'CLOSED'}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  // --- Stats ---
  const stats = useMemo(() => {
    const todayBookings = bookings.filter(b => b.date === format(new Date(), 'yyyy-MM-dd'));
    const totalRevenue = bookings.filter(b => b.status === 'completed').reduce((acc, b) => acc + b.price, 0);
    const serviceCounts = bookings.reduce((acc: any, b) => {
      acc[b.service] = (acc[b.service] || 0) + 1;
      return acc;
    }, {});
    
    const chartData = Object.entries(serviceCounts).map(([name, value]) => ({ name, value }));

    return {
      todayCount: todayBookings.length,
      totalRevenue,
      chartData
    };
  }, [bookings]);

  // --- UI Components ---
  const TopBar = () => (
    <header className="top-bar">
      <div className="flex items-center gap-[15px]">
        <div className="w-[50px] h-[50px] bg-gold rounded-full flex items-center justify-center font-display font-bold text-black text-2xl border-2 border-[#F5F5F5]">
          S
        </div>
        <div className="brand-name">Skull Barber Studio</div>
      </div>
      <div className="status-badge">
        {settings.isOpen ? "Studio Open" : "Studio Closed"}
      </div>
    </header>
  );

  const CustomerView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] flex-grow min-h-[calc(100vh-140px)]">
      <aside className="sidebar hidden lg:flex">
        <div className="space-y-6">
          <h3 className="sidebar-title">Our Services</h3>
          <div className="space-y-2">
            {SERVICES.map(s => (
              <div key={s.name} className="service-item">
                <span>{s.name}</span>
                <span className="font-bold text-gold">{(s.price / 1000)}K</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="schedule-card">
          <h3 className="sidebar-title !border-[#444] !text-white">Business Hours</h3>
          <p className="text-xs mb-1">Mon - Sun: 10.00 - 22.00</p>
          <p className="text-xs italic text-gold">Friday: 13.00 - 22.00 (After Jum'at)</p>
        </div>
      </aside>

      <main className="p-6 md:p-10 bg-[radial-gradient(circle_at_top_right,#111,#000)] grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-10 overflow-y-auto">
        <div className="space-y-6">
          <h2 className="section-heading">Secure Your <span className="text-gold">Seat</span>.</h2>
          
          <Card className="bg-[#111] border-[#222] p-6 md:p-8 rounded-lg shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
            <form onSubmit={handleBooking} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase text-gold font-semibold">Customer Name</Label>
                <Input name="name" placeholder="Enter your full name" required className="bg-black border-[#333] text-white h-12 focus:border-gold" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase text-gold font-semibold">WhatsApp Number</Label>
                <Input name="whatsapp" placeholder="628..." required className="bg-black border-[#333] text-white h-12 focus:border-gold" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase text-gold font-semibold">Service</Label>
                  <Select name="service" required>
                    <SelectTrigger className="bg-black border-[#333] text-white h-12 focus:border-gold">
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-[#333]">
                      {SERVICES.map(s => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name} ({(s.price / 1000)}K)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase text-gold font-semibold">Date</Label>
                    <Input name="date" type="date" min={format(new Date(), 'yyyy-MM-dd')} required className="bg-black border-[#333] text-white h-12 focus:border-gold p-2" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase text-gold font-semibold">Time</Label>
                    <Input name="time" type="time" required className="bg-black border-[#333] text-white h-12 focus:border-gold p-2" />
                  </div>
                </div>
              </div>
              <Button type="submit" disabled={!settings.isOpen} className="w-full bg-gold text-black font-black uppercase tracking-widest h-14 rounded-sm hover:bg-gold/90 transition-all mt-4">
                {settings.isOpen ? "Confirm Reservation" : "Studio Closed"}
              </Button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <h3 className="sidebar-title">Latest Ticket</h3>
          {lastBooking ? (
            <div className="ticket-preview">
              <p className="text-[10px] uppercase tracking-[2px]">Priority Pass</p>
              <div className="font-mono text-2xl text-gold my-2.5">#{lastBooking.id.slice(-6).toUpperCase()}</div>
              <p className="font-bold text-lg">{lastBooking.name}</p>
              <p className="text-[13px] text-gold mt-1">{lastBooking.date} at {lastBooking.time}</p>
              
              <div className="mt-5 pt-4 border-t border-[#333] w-full space-y-3">
                <div className="w-20 h-20 bg-white mx-auto flex items-center justify-center text-black text-[8px] font-bold">
                  QR CODE
                </div>
                <p className="text-[9px] opacity-60">Show this at the desk</p>
              </div>
            </div>
          ) : (
            <div className="ticket-preview opacity-40 grayscale">
              <p className="text-[10px] uppercase tracking-[2px]">No Booking Yet</p>
              <div className="font-mono text-2xl text-gold my-2.5">#XXXXXX</div>
              <p className="font-bold text-lg">Your Name Here</p>
              <p className="text-[13px] text-gold mt-1">--:--</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-[11px] leading-relaxed text-[#666]">
              After booking, you will be redirected to WhatsApp for final confirmation.
            </p>
          </div>
        </div>
      </main>
    </div>
  );

  const AdminView = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayBookings = bookings.filter(b => b.date === today);
    const pendingBookings = todayBookings.filter(b => b.status === 'pending').sort((a, b) => a.time.localeCompare(b.time));

    return (
      <div className="flex-grow p-6 md:p-10 bg-[radial-gradient(circle_at_top_right,#111,#000)] overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="section-heading !mb-0">Admin <span className="text-gold">Dashboard</span></h2>
              <p className="text-muted-foreground text-sm">Manage your studio operations in real-time.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-black p-3 rounded-sm border border-[#333]">
                <span className="text-[11px] uppercase text-gold font-bold">Studio Status:</span>
                <Switch checked={settings.isOpen} onCheckedChange={toggleShop} />
                <Badge variant={settings.isOpen ? "outline" : "destructive"} className="ml-2 rounded-sm uppercase text-[10px]">
                  {settings.isOpen ? "OPEN" : "CLOSED"}
                </Badge>
              </div>
              <Button variant="outline" size="icon" onClick={() => setView('customer')} className="border-[#333] text-muted-foreground hover:border-gold hover:text-gold">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-[#111] border-[#333] p-6">
              <div className="text-[11px] uppercase text-gold font-bold mb-2 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Today's Bookings
              </div>
              <div className="text-4xl font-black">{stats.todayCount}</div>
            </Card>
            <Card className="bg-[#111] border-[#333] p-6">
              <div className="text-[11px] uppercase text-gold font-bold mb-2 flex items-center gap-2">
                <DollarSign className="w-3 h-3" /> Total Revenue
              </div>
              <div className="text-4xl font-black">Rp {stats.totalRevenue.toLocaleString()}</div>
            </Card>
            <Card className="bg-[#111] border-[#333] p-6">
              <div className="text-[11px] uppercase text-gold font-bold mb-2 flex items-center gap-2">
                <Users className="w-3 h-3" /> Total Clients
              </div>
              <div className="text-4xl font-black">{bookings.length}</div>
            </Card>
          </div>

          <Tabs defaultValue="queue" className="w-full">
            <TabsList className="bg-black border border-[#333] p-1 rounded-sm">
              <TabsTrigger value="queue" className="data-[state=active]:bg-gold data-[state=active]:text-black rounded-sm uppercase text-xs font-bold px-6">Queue</TabsTrigger>
              <TabsTrigger value="stats" className="data-[state=active]:bg-gold data-[state=active]:text-black rounded-sm uppercase text-xs font-bold px-6">Analytics</TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-gold data-[state=active]:text-black rounded-sm uppercase text-xs font-bold px-6">History</TabsTrigger>
            </TabsList>
            
            <TabsContent value="queue" className="space-y-6 pt-6">
              <h3 className="sidebar-title">Active Queue ({pendingBookings.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {pendingBookings.map((b) => {
                    const now = new Date();
                    const [hours, minutes] = b.time.split(':').map(Number);
                    const bookingTime = setMinutes(setHours(new Date(), hours), minutes);
                    const isCurrent = isWithinInterval(now, {
                      start: setMinutes(bookingTime, -15),
                      end: setMinutes(bookingTime, 45)
                    });

                    return (
                      <motion.div
                        key={b.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                      >
                        <Card className={`bg-[#111] border ${isCurrent ? 'border-gold shadow-[0_0_15px_rgba(212,175,55,0.2)]' : 'border-[#333]'} p-4`}>
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl font-black text-gold">{b.time}</span>
                                {isCurrent && <Badge className="bg-gold text-black text-[10px] font-black">NOW</Badge>}
                              </div>
                              <h4 className="font-bold text-lg uppercase tracking-tight">{b.name}</h4>
                              <p className="text-xs text-muted-foreground uppercase tracking-widest">{b.service}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <Phone className="w-3 h-3" /> {b.whatsapp}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button size="sm" onClick={() => updateBookingStatus(b.id, 'completed')} className="bg-green-600 hover:bg-green-700 h-8 w-8 p-0">
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => updateBookingStatus(b.id, 'no-show')} className="h-8 w-8 p-0">
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {pendingBookings.length === 0 && (
                  <div className="col-span-full py-16 text-center text-muted-foreground border-2 border-dashed border-[#222] rounded-lg">
                    No pending bookings for today.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="stats" className="pt-6">
              <Card className="bg-[#111] border-[#333] p-6">
                <h3 className="sidebar-title">Popular Services</h3>
                <div className="h-[400px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="name" stroke="#444" fontSize={10} tick={{ fill: '#444' }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#444" fontSize={10} axisLine={false} tickLine={false} />
                      <Tooltip 
                        cursor={{ fill: '#1a1a1a' }}
                        contentStyle={{ backgroundColor: '#000', border: '1px solid #D4AF37', borderRadius: '4px' }}
                        itemStyle={{ color: '#D4AF37', fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                        {stats.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#D4AF37' : '#B91C1C'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="pt-6">
              <Card className="bg-[#111] border-[#333] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-black border-b border-[#333] text-gold uppercase tracking-widest font-bold">
                        <th className="p-4 text-left">Date</th>
                        <th className="p-4 text-left">Client</th>
                        <th className="p-4 text-left">Service</th>
                        <th className="p-4 text-left">Status</th>
                        <th className="p-4 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222]">
                      {bookings.slice(0, 30).map((b) => (
                        <tr key={b.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 text-muted-foreground">{b.date}</td>
                          <td className="p-4 font-bold uppercase">{b.name}</td>
                          <td className="p-4 text-muted-foreground uppercase">{b.service}</td>
                          <td className="p-4">
                            <Badge variant="outline" className={`rounded-sm text-[9px] uppercase font-black ${b.status === 'completed' ? 'border-green-500 text-green-500' : b.status === 'no-show' ? 'border-red-500 text-red-500' : 'border-gold text-gold'}`}>
                              {b.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-right font-mono">Rp {b.price.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  };

  const TicketModal = () => (
    <AnimatePresence>
      {showTicket && lastBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-sm"
          >
            <div className="ticket-preview p-10 space-y-6">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[3px] text-muted-foreground">Priority Pass</p>
                <div className="font-mono text-3xl text-gold font-black">#{lastBooking.id.slice(-6).toUpperCase()}</div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-gold font-bold">Customer</p>
                <p className="text-2xl font-display font-black uppercase">{lastBooking.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-[#222]">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Date</p>
                  <p className="font-bold">{lastBooking.date}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Time</p>
                  <p className="font-bold">{lastBooking.time}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="w-24 h-24 bg-white mx-auto flex items-center justify-center text-black text-[10px] font-black">
                  QR CODE
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Show this digital ticket at the front desk.
                </p>
                <div className="flex gap-3">
                  <Button onClick={() => window.print()} variant="outline" className="flex-1 border-[#333] text-muted-foreground hover:border-gold hover:text-gold rounded-sm uppercase text-[10px] font-bold">
                    <Download className="w-3 h-3 mr-2" /> Save
                  </Button>
                  <Button onClick={() => setShowTicket(false)} className="flex-1 bg-gold text-black font-black rounded-sm uppercase text-[10px]">
                    DONE
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const AdminLoginModal = () => (
    <AnimatePresence>
      {showAdminLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="w-full max-w-md"
          >
            <Card className="bg-[#111] border-[#333] p-8 rounded-lg shadow-2xl">
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-gold/10 rounded-full flex items-center justify-center mx-auto border border-gold/20">
                  <Lock className="w-8 h-8 text-gold" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-display font-black uppercase tracking-tight">Admin Access</h2>
                  <p className="text-muted-foreground text-xs uppercase tracking-widest">Authorized Personnel Only</p>
                </div>

                <div className="space-y-4 pt-4">
                  {user ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-black rounded-sm border border-[#333] flex items-center gap-4">
                        <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border border-gold" />
                        <div className="text-left">
                          <p className="font-bold text-sm uppercase">{user.displayName}</p>
                          <p className="text-[10px] text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      {isAdmin ? (
                        <Button onClick={() => { setView('admin'); setShowAdminLogin(false); }} className="w-full bg-gold text-black font-black uppercase tracking-widest h-12 rounded-sm">
                          Enter Dashboard
                        </Button>
                      ) : (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm">
                          <p className="text-red-500 text-[10px] font-black uppercase">Access Denied: Not an Admin</p>
                        </div>
                      )}
                      <Button variant="ghost" onClick={logout} className="w-full text-muted-foreground hover:text-white text-[10px] uppercase font-bold">
                        <LogOut className="w-3 h-3 mr-2" /> Sign Out
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={signInWithGoogle} className="w-full bg-gold text-black font-black uppercase tracking-widest h-12 rounded-sm">
                      Sign In with Google
                    </Button>
                  )}
                  <Button variant="link" onClick={() => setShowAdminLogin(false)} className="w-full text-muted-foreground text-[10px] uppercase font-bold">
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-black text-[#F5F5F5] flex flex-col selection:bg-gold selection:text-black">
      <TopBar />
      
      {view === 'customer' ? <CustomerView /> : <AdminView />}

      <footer className="h-[60px] border-t border-[#222] flex items-center justify-between px-6 md:px-10 bg-black text-[11px] text-[#888]">
        <div>
          &copy; 2024 Skull Barber Studio - Premium Grooming. Owner: skullstudio09@gmail.com
        </div>
        <button 
          onClick={() => setShowAdminLogin(true)}
          className="admin-btn"
        >
          Admin Access
        </button>
      </footer>

      <TicketModal />
      <AdminLoginModal />
      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
}
