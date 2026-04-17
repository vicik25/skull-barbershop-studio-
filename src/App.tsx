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
  X,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Info,
  AlertTriangle,
  FileText,
  Save,
  Edit,
  Bell
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
import { 
  format, 
  isToday, 
  parseISO, 
  isWithinInterval, 
  setHours, 
  setMinutes,
  addMinutes,
  parse,
  isBefore,
  isAfter,
  isEqual
} from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import confetti from 'canvas-confetti';

// --- Firestore Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  toast.error(`Permission Denied: ${operationType} on ${path}`);
  throw new Error(JSON.stringify(errInfo));
}

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [errorState, setErrorState] = useState<{ hasError: boolean, error: Error | null }>({ hasError: false, error: null });

  useEffect(() => {
    const errorHandler = (error: ErrorEvent) => {
      setErrorState({ hasError: true, error: error.error });
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  if (errorState.hasError) {
    let message = "Something went wrong.";
    try {
      const info = JSON.parse(errorState.error?.message || "{}");
      if (info.error) message = `Firestore Error: ${info.error}`;
    } catch (e) {}
    
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <Card className="bg-[#111] border-red-500 p-8 max-w-md text-center space-y-4">
          <XCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-white">Application Error</h2>
          <p className="text-muted-foreground text-sm">{message}</p>
          <Button onClick={() => window.location.reload()} className="bg-gold text-black font-bold">
            Reload Application
          </Button>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}

// --- Types ---
interface Booking {
  id: string;
  name: string;
  whatsapp: string;
  service: string;
  date: string;
  time: string;
  status: 'pending' | 'completed' | 'no-show' | 'cancelled';
  createdAt: any;
  price: number;
  duration: number;
}

interface ShopSettings {
  isOpen: boolean;
}

const SERVICES = [
  { name: 'Anak', price: 35000, duration: 30 },
  { name: 'Dewasa', price: 50000, duration: 45 },
  { name: 'Semir Uban', price: 50000, duration: 30 },
  { name: 'Downperm', price: 120000, duration: 60 },
  { name: 'Keratin', price: 200000, duration: 90 },
  { name: 'Perming Curly/Wavy', price: 250000, duration: 120 },
  { name: 'Hairlight', price: 180000, duration: 90 },
  { name: 'Coloring Full', price: 225000, duration: 90 },
  { name: 'Cornrows', price: 400000, duration: 180 },
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
  const [showPolicy, setShowPolicy] = useState(false);
  const [showNotes, setShowNotes] = useState<{ open: boolean, client: any }>({ open: false, client: null });
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [clientNotes, setClientNotes] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedService, setSelectedService] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [dateBookings, setDateBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<{id: string, message: string, time: Date}[]>([]);
  const [noteContent, setNoteContent] = useState('');
  const [clientSort, setClientSort] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'totalBookings', direction: 'desc' });
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- Auth & Initial Data ---
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'clientNotes'), (snapshot) => {
      const notes: Record<string, string> = {};
      snapshot.docs.forEach(doc => {
        notes[doc.id] = doc.data().note;
      });
      setClientNotes(notes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clientNotes');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'bookings'), where('date', '==', selectedDate));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setDateBookings(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings_by_date');
    });
    return () => unsubscribe();
  }, [selectedDate]);

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
        
        const newDoc = snapshot.docChanges().find(change => change.type === 'added');
        if (newDoc) {
          const booking = newDoc.doc.data() as Booking;
          setNotifications(prev => [{
            id: newDoc.doc.id,
            message: `New booking: ${booking.name} for ${booking.service}`,
            time: new Date()
          }, ...prev].slice(0, 10)); // Keep last 10
        }
      }
      
      setBookings(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });
    return () => unsubscribe();
  }, [bookings.length]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'shop'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as ShopSettings);
      } else if (isAdmin && auth.currentUser) {
        // Only admins should attempt to initialize the settings document
        // and only if we are sure they are logged in
        setDoc(doc(db, 'settings', 'shop'), { isOpen: true }).catch(err => {
          // If it's a permission error, we might not be fully authorized yet
          if (err.code !== 'permission-denied') {
            handleFirestoreError(err, OperationType.WRITE, 'settings/shop');
          }
        });
      }
    }, (error) => {
      // Customers can read, but if the doc doesn't exist, some SDK versions might throw
      // We only care about errors for admins who should have access
      if (isAdmin && error.code !== 'permission-denied') {
        handleFirestoreError(error, OperationType.GET, 'settings/shop');
      }
    });
    return () => unsubscribe();
  }, [isAdmin, user]); // Depend on both for safety

  // --- Handlers ---
  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Login error:', error);
        toast.error('Login failed. Please try again.');
      }
    }
  };

  const handleBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!settings.isOpen) {
      toast.error('Studio is currently closed.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const serviceName = selectedService;
    const date = selectedDate;
    const time = selectedTime;
    
    if (!serviceName || !date || !time) {
      toast.error('Please complete all booking information.');
      return;
    }

    const service = SERVICES.find(s => s.name === serviceName);
    
    if (!service) return;

    // --- Capacity Validation (Max 2 people) ---
    const proposedStart = parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
    const proposedEnd = addMinutes(proposedStart, service.duration);

    // Check for overlaps with existing pending bookings
    // Use the potentially more up-to-date bookings state or dateBookings
    const overlappingBookings = dateBookings.filter(b => {
      if (b.status !== 'pending') return false;
      
      const bStart = parse(`${b.date} ${b.time}`, 'yyyy-MM-dd HH:mm', new Date());
      const bEnd = addMinutes(bStart, b.duration || 30);

      // Interval overlap check: (StartA < EndB) and (StartB < EndA)
      return isBefore(proposedStart, bEnd) && isBefore(bStart, proposedEnd);
    });

    // Check capacity at discrete points (start times of all involved bookings)
    const pointsToCheck = [proposedStart, ...overlappingBookings.map(b => parse(`${b.date} ${b.time}`, 'yyyy-MM-dd HH:mm', new Date()))];
    
    const isFull = pointsToCheck.some(point => {
      // Don't check points outside our proposed interval
      if (isBefore(point, proposedStart) || isAfter(point, addMinutes(proposedStart, service.duration - 1))) {
        return false;
      }

      const concurrentCount = overlappingBookings.filter(b => {
        const bStart = parse(`${b.date} ${b.time}`, 'yyyy-MM-dd HH:mm', new Date());
        const bEnd = addMinutes(bStart, b.duration || 30);
        return (isEqual(point, bStart) || isAfter(point, bStart)) && isBefore(point, bEnd);
      }).length;

      return concurrentCount >= 2;
    });

    if (isFull) {
      toast.error('Maaf, slot jam ini sudah penuh (Maksimal 2 orang). Silakan pilih jam lain.');
      return;
    }

    const bookingData = {
      name: formData.get('name'),
      whatsapp: formData.get('whatsapp'),
      service: serviceName,
      date,
      time,
      status: 'pending',
      createdAt: serverTimestamp(),
      price: service.price,
      duration: service.duration
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
      setSelectedService('');
      setSelectedTime('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
    }
  };

  const updateBookingStatus = async (id: string, status: 'completed' | 'no-show' | 'cancelled') => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
      toast.success(`Booking marked as ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${id}`);
    }
  };

  const toggleShop = async () => {
    try {
      await updateDoc(doc(db, 'settings', 'shop'), { isOpen: !settings.isOpen });
      toast.success(`Studio is now ${!settings.isOpen ? 'OPEN' : 'CLOSED'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/shop');
    }
  };

  const handleUpdateBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingBooking) return;

    const formData = new FormData(e.currentTarget);
    const serviceName = formData.get('service') as string;
    const date = formData.get('date') as string;
    const time = formData.get('time') as string;
    const status = formData.get('status') as string;
    const service = SERVICES.find(s => s.name === serviceName);

    if (!service) return;

    try {
      await updateDoc(doc(db, 'bookings', editingBooking.id), {
        service: serviceName,
        date,
        time,
        status,
        price: service.price,
        duration: service.duration
      });
      toast.success('Booking updated successfully');
      setEditingBooking(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${editingBooking.id}`);
    }
  };

  // --- Stats ---
  const handleUpdateNote = async () => {
    if (!showNotes.client) return;
    try {
      await setDoc(doc(db, 'clientNotes', showNotes.client.whatsapp), {
        note: noteContent,
        updatedAt: serverTimestamp()
      });
      toast.success('Note updated');
      setShowNotes({ open: false, client: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `clientNotes/${showNotes.client.whatsapp}`);
    }
  };

  const clients = useMemo(() => {
    const clientMap = new Map();
    bookings.forEach(b => {
      const key = b.whatsapp;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          name: b.name,
          whatsapp: b.whatsapp,
          totalBookings: 0,
          totalSpent: 0,
          lastBooking: b.date,
          history: []
        });
      }
      const client = clientMap.get(key);
      client.totalBookings++;
      if (b.status === 'completed') {
        client.totalSpent += b.price;
      }
      if (new Date(b.date) > new Date(client.lastBooking)) {
        client.lastBooking = b.date;
      }
      client.history.push(b);
    });
    
    const clientList = Array.from(clientMap.values());
    
    return clientList.sort((a: any, b: any) => {
      const { key, direction } = clientSort;
      let valA = a[key];
      let valB = b[key];
      
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [bookings, clientSort]);

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
  const timeSlots = useMemo(() => {
    const isFriday = new Date(selectedDate).getDay() === 5;
    const startHour = isFriday ? 13 : 10;
    const endHour = 22;
    
    const slots = [];
    for (let h = startHour; h < endHour; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
      slots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    return slots;
  }, [selectedDate]);

  const estimatedEndTime = useMemo(() => {
    if (!selectedService || !selectedTime) return null;
    const service = SERVICES.find(s => s.name === selectedService);
    if (!service) return null;
    try {
      const startTime = parse(selectedTime, 'HH:mm', new Date());
      return format(addMinutes(startTime, service.duration), 'HH:mm');
    } catch {
      return null;
    }
  }, [selectedService, selectedTime]);

  const getSlotStatus = (slotTimeStr: string) => {
    const slotDate = parse(`${selectedDate} ${slotTimeStr}`, 'yyyy-MM-dd HH:mm', new Date());
    
    const concurrentCount = dateBookings.filter(b => {
      // Only count active bookings (pending/completed) that cover this slot
      if (b.status === 'cancelled' || b.status === 'no-show') return false;
      const bStart = parse(`${b.date} ${b.time}`, 'yyyy-MM-dd HH:mm', new Date());
      const bEnd = addMinutes(bStart, b.duration || 30);
      return (isEqual(slotDate, bStart) || isAfter(slotDate, bStart)) && isBefore(slotDate, bEnd);
    }).length;

    return concurrentCount;
  };

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
              <div key={s.name} className="service-item flex-col items-start !gap-0">
                <div className="flex justify-between w-full">
                  <span>{s.name}</span>
                  <span className="font-bold text-gold">{(s.price / 1000)}K</span>
                </div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">Duration: {s.duration} mins</span>
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
                  <Select value={selectedService} onValueChange={setSelectedService} required>
                    <SelectTrigger className="bg-black border-[#333] text-white h-12 focus:border-gold">
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-[#333]">
                      {SERVICES.map(s => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name} ({(s.price / 1000)}K - {s.duration}m)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase text-gold font-semibold">Date</Label>
                  <Input 
                    type="date" 
                    min={format(new Date(), 'yyyy-MM-dd')} 
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedTime(''); // Reset time when date changes
                    }}
                    required 
                    className="bg-black border-[#333] text-white h-12 focus:border-gold p-2" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-[11px] uppercase text-gold font-semibold">Available Time Slots</Label>
                  {estimatedEndTime && (
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">
                      Finish Est: <span className="text-gold">{estimatedEndTime}</span>
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                  {timeSlots.map(slot => {
                    const count = getSlotStatus(slot);
                    const isFull = count >= 2;
                    const isSelected = selectedTime === slot;
                    
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isFull}
                        onClick={() => setSelectedTime(slot)}
                        className={`
                          relative py-3 rounded-sm text-xs font-bold transition-all border flex items-center justify-center gap-1
                          ${isSelected 
                            ? 'bg-gold text-black border-gold shadow-[0_0_20px_rgba(212,175,55,0.4)] scale-105 z-10' 
                            : isFull 
                              ? 'bg-zinc-900/50 text-zinc-700 border-[#222] cursor-not-allowed' 
                              : 'bg-black text-white border-[#333] hover:border-gold/50 hover:bg-white/5'
                          }
                        `}
                      >
                        {isSelected && <CheckCircle2 className="w-3 h-3" />}
                        {slot}
                        {isFull ? (
                          <span className="absolute -top-1 -right-1 bg-red-600 text-[8px] px-1.5 py-0.5 rounded-sm text-white font-black border border-red-400 shadow-lg uppercase">Full</span>
                        ) : count === 1 ? (
                          <span className="absolute -top-1 -right-1 bg-zinc-800 text-[7px] px-1 rounded-sm text-gold border border-gold/30">1 Slot</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button type="submit" disabled={!settings.isOpen || !selectedTime} className="w-full bg-gold text-black font-black uppercase tracking-widest h-14 rounded-sm hover:bg-gold/90 transition-all mt-4">
                {settings.isOpen ? "Confirm Reservation" : "Studio Closed"}
              </Button>
              <div className="flex justify-center items-center gap-2 mt-4 text-[10px] text-zinc-500">
                <Info className="w-3 h-3 text-gold" />
                <span>Read our <button type="button" onClick={() => setShowPolicy(true)} className="text-gold underline hover:text-gold/80 transition-colors">Cancellation Policy</button> before booking.</span>
              </div>
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

  const ClientsView = () => {
    const handleSort = (key: string) => {
      setClientSort(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
    };

    const SortIcon = ({ column }: { column: string }) => {
      if (clientSort.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
      return clientSort.direction === 'asc' ? <ChevronUp className="w-3 h-3 ml-1 text-gold" /> : <ChevronDown className="w-3 h-3 ml-1 text-gold" />;
    };

    return (
      <div className="pt-6 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="sidebar-title">Client Database ({clients.length})</h3>
        </div>
        <Card className="bg-[#111] border-[#333] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-black border-b border-[#333] text-gold uppercase tracking-widest font-bold">
                  <th 
                    className="p-4 text-left cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">
                      Client Name <SortIcon column="name" />
                    </div>
                  </th>
                  <th className="p-4 text-left">WhatsApp</th>
                  <th 
                    className="p-4 text-center cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleSort('totalBookings')}
                  >
                    <div className="flex items-center justify-center">
                      Visits <SortIcon column="totalBookings" />
                    </div>
                  </th>
                  <th className="p-4 text-left">Last Visit</th>
                  <th 
                    className="p-4 text-right cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleSort('totalSpent')}
                  >
                    <div className="flex items-center justify-end">
                      Total Spent <SortIcon column="totalSpent" />
                    </div>
                  </th>
                  <th className="p-4 text-center">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {clients.map((c) => (
                  <tr key={c.whatsapp} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-bold uppercase">{c.name}</td>
                    <td className="p-4 text-muted-foreground">
                      <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-gold transition-colors">
                        <Phone className="w-3 h-3" /> {c.whatsapp}
                      </a>
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant="outline" className="border-gold text-gold font-bold">
                        {c.totalBookings}
                      </Badge>
                    </td>
                    <td className="p-4 text-muted-foreground">{c.lastBooking}</td>
                    <td className="p-4 text-right font-mono font-bold text-gold">
                      Rp {c.totalSpent.toLocaleString()}
                    </td>
                    <td className="p-4 text-center">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className={`hover:text-gold ${clientNotes[c.whatsapp] ? 'text-gold' : 'text-zinc-600'}`}
                        onClick={() => {
                          setNoteContent(clientNotes[c.whatsapp] || '');
                          setShowNotes({ open: true, client: c });
                        }}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clients.length === 0 && (
              <div className="py-20 text-center text-muted-foreground">
                No clients found in the database.
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  };

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
              <TabsTrigger value="clients" className="data-[state=active]:bg-gold data-[state=active]:text-black rounded-sm uppercase text-xs font-bold px-6">Clients</TabsTrigger>
              <TabsTrigger value="stats" className="data-[state=active]:bg-gold data-[state=active]:text-black rounded-sm uppercase text-xs font-bold px-6">Analytics</TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-gold data-[state=active]:text-black rounded-sm uppercase text-xs font-bold px-6">History</TabsTrigger>
            </TabsList>
            
            <TabsContent value="queue" className="space-y-6 pt-6">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
                <div className="space-y-6">
                  <h3 className="sidebar-title">Active Queue ({pendingBookings.length})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {pendingBookings.map((b, index) => {
                    const [hours, minutes] = b.time.split(':').map(Number);
                    const bookingTime = setMinutes(setHours(new Date(), hours), minutes);
                    const isCurrent = isWithinInterval(currentTime, {
                      start: bookingTime,
                      end: addMinutes(bookingTime, b.duration || 30)
                    });

                    return (
                      <motion.div
                        key={b.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: isCurrent ? 1.05 : 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="relative"
                      >
                        {isCurrent && (
                          <div className="absolute -inset-1 bg-gold rounded-sm blur-sm opacity-30 animate-pulse"></div>
                        )}
                        <Card className={`relative transition-all duration-500 ${isCurrent ? 'bg-gold border-white shadow-[0_0_30px_rgba(212,175,55,0.4)] ring-1 ring-white/20' : 'bg-[#111] border-[#333]'} p-4`}>
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-2xl font-black ${isCurrent ? 'text-black' : 'text-gold'}`}>{b.time}</span>
                                <Badge variant="outline" className={`text-[10px] ${isCurrent ? 'border-black/30 text-black/70' : 'border-gold/30 text-gold/70'}`}>#{index + 1}</Badge>
                                {isCurrent && (
                                  <motion.div
                                    animate={{ opacity: [1, 0.5, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                  >
                                    <Badge className="bg-black text-gold text-[10px] font-black border-none px-2 uppercase">Current</Badge>
                                  </motion.div>
                                )}
                              </div>
                              <h4 className={`font-black text-xl uppercase tracking-tighter leading-none ${isCurrent ? 'text-black' : 'text-white'}`}>{b.name}</h4>
                              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${isCurrent ? 'text-black/70' : 'text-gold'}`}>{b.service}</p>
                              <div className={`flex items-center gap-2 text-[11px] font-medium ${isCurrent ? 'text-black/60' : 'text-zinc-500'}`}>
                                <Phone className="w-3 h-3" /> {b.whatsapp}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setEditingBooking(b)} 
                                className={`${isCurrent ? 'border-black/40 text-black hover:bg-black/10' : 'border-zinc-700 text-zinc-400 hover:text-white'} h-9 w-9 p-0`} 
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                onClick={() => updateBookingStatus(b.id, 'completed')} 
                                className={`${isCurrent ? 'bg-black text-gold hover:bg-black/90 shadow-xl scale-110' : 'bg-green-600 hover:bg-green-700'} h-9 w-9 p-0`} 
                                title="Complete"
                              >
                                <CheckCircle2 className="w-5 h-5" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant={isCurrent ? "secondary" : "destructive"} 
                                onClick={() => updateBookingStatus(b.id, 'no-show')} 
                                className={`${isCurrent ? 'bg-black/20 text-black hover:bg-black/30 border-none' : ''} h-9 w-9 p-0`} 
                                title="No-Show"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => updateBookingStatus(b.id, 'cancelled')} 
                                className={`h-9 w-9 p-0 ${isCurrent ? 'border-black/20 text-black hover:bg-black/10' : 'border-red-500 text-red-500 hover:bg-red-500/10'}`} 
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {pendingBookings.length === 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="col-span-full py-20 text-center text-muted-foreground border-2 border-dashed border-[#222] rounded-sm bg-black/20"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <Scissors className="w-10 h-10 opacity-10" />
                      <p className="font-display uppercase tracking-widest text-sm">No pending bookings for today.</p>
                      <p className="text-[10px] opacity-50">New reservations will appear here automatically.</p>
                    </div>
                  </motion.div>
                )}
                </div>
              </div>

              <div className="space-y-6">
                  <div className="flex items-center gap-2 text-gold">
                    <Bell className="w-4 h-4" />
                    <h3 className="uppercase text-xs font-black tracking-widest">Live Activity</h3>
                  </div>
                  <Card className="bg-black/40 border-[#222] p-4 min-h-[400px]">
                    <div className="space-y-4">
                      {notifications.length === 0 ? (
                        <p className="text-[10px] text-zinc-600 uppercase text-center py-10">No recent activity</p>
                      ) : (
                        notifications.map(n => (
                          <motion.div 
                            key={n.id} 
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="text-[11px] pb-3 border-b border-[#222] last:border-0"
                          >
                            <p className="text-zinc-400 leading-tight">{n.message}</p>
                            <p className="text-zinc-600 text-[9px] mt-1">{format(n.time, 'HH:mm:ss')}</p>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="clients">
              <ClientsView />
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
                            <Badge variant="outline" className={`rounded-sm text-[9px] uppercase font-black ${
                              b.status === 'completed' ? 'border-green-500 text-green-500' : 
                              b.status === 'no-show' ? 'border-red-500 text-red-500' : 
                              b.status === 'cancelled' ? 'border-zinc-500 text-zinc-500' :
                              'border-gold text-gold'
                            }`}>
                              {b.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-right font-mono">Rp {b.price.toLocaleString()}</td>
                          <td className="p-4 text-right">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-gold" onClick={() => setEditingBooking(b)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          </td>
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

  const PolicyModal = () => (
    <AnimatePresence>
      {showPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-zinc-950 border border-[#333] p-8 rounded-sm shadow-2xl relative"
          >
            <button 
              onClick={() => setShowPolicy(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="w-6 h-6 text-gold" />
              <h2 className="font-display font-black text-xl uppercase tracking-widest">Cancellation Policy</h2>
            </div>
            
            <div className="space-y-6 text-sm text-zinc-400">
              <section className="space-y-2">
                <h4 className="text-gold font-bold uppercase text-xs tracking-wider">1. Cancellation Timing</h4>
                <p className="leading-relaxed">Cancellations must be made at least **2 hours** before your scheduled appointment time.</p>
              </section>
              
              <section className="space-y-2">
                <h4 className="text-gold font-bold uppercase text-xs tracking-wider">2. Late Arrival</h4>
                <p className="leading-relaxed">We provide a **15-minute grace period**. If you arrive more than 15 minutes late, your appointment may be automatically cancelled or given to the next available client.</p>
              </section>
              
              <section className="space-y-2">
                <h4 className="text-gold font-bold uppercase text-xs tracking-wider">3. No-Show Policy</h4>
                <p className="leading-relaxed">Failure to show up without prior notification may result in a blacklisting from future online reservations.</p>
              </section>

              <div className="pt-4 border-t border-[#222]">
                <p className="text-[10px] italic">Please contact us via WhatsApp if you need to reschedule or have issues arriving on time.</p>
              </div>
            </div>

            <Button 
              onClick={() => setShowPolicy(false)}
              className="w-full bg-gold text-black font-black uppercase mt-8 h-12 rounded-sm"
            >
              I Understand
            </Button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const EditBookingModal = () => (
    <AnimatePresence>
      {editingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-zinc-950 border border-[#333] p-8 rounded-sm shadow-2xl relative"
          >
            <button 
              onClick={() => setEditingBooking(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <Edit className="w-6 h-6 text-gold" />
              <div>
                <h2 className="font-display font-black text-xl uppercase tracking-widest">Edit Booking</h2>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">Client: {editingBooking.name}</p>
              </div>
            </div>
            
            <form onSubmit={handleUpdateBooking} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-gold font-bold">Service</Label>
                <Select name="service" defaultValue={editingBooking.service} required>
                  <SelectTrigger className="bg-black border-[#333] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-[#333]">
                    {SERVICES.map(s => (
                      <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-gold font-bold">Date</Label>
                  <Input name="date" type="date" defaultValue={editingBooking.date} required className="bg-black border-[#333]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-gold font-bold">Time</Label>
                  <Input name="time" type="time" defaultValue={editingBooking.time} required className="bg-black border-[#333]" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-gold font-bold">Status</Label>
                <Select name="status" defaultValue={editingBooking.status} required>
                  <SelectTrigger className="bg-black border-[#333] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-[#333]">
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="no-show">No-Show</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => setEditingBooking(null)}
                  className="flex-1 border-[#333] text-muted-foreground uppercase text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  className="flex-1 bg-gold text-black font-black uppercase text-xs"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const NotesModal = () => (
    <AnimatePresence>
      {showNotes.open && showNotes.client && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-zinc-950 border border-[#333] p-8 rounded-sm shadow-2xl relative"
          >
            <button 
              onClick={() => setShowNotes({ open: false, client: null })}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <FileText className="w-6 h-6 text-gold" />
              <div>
                <h2 className="font-display font-black text-xl uppercase tracking-widest">Client Notes</h2>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">{showNotes.client.name} - {showNotes.client.whatsapp}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <textarea 
                className="w-full h-40 bg-black border border-[#333] p-4 text-sm text-white focus:border-gold outline-none resize-none rounded-sm"
                placeholder="Add special requests, preferences, or technical notes about this client's hair..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
              />
              
              <div className="flex gap-3">
                <Button 
                  variant="outline"
                  onClick={() => setShowNotes({ open: false, client: null })}
                  className="flex-1 border-[#333] text-muted-foreground uppercase text-xs font-bold h-12"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateNote}
                  className="flex-1 bg-gold text-black font-black uppercase text-xs h-12"
                >
                  <Save className="w-4 h-4 mr-2" /> Save Note
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const TicketModal = () => {
    const queueNumber = useMemo(() => {
      if (!lastBooking) return null;
      const today = lastBooking.date;
      const todaySorted = bookings
        .filter(b => b.date === today && b.status === 'pending')
        .sort((a, b) => a.time.localeCompare(b.time));
      const index = todaySorted.findIndex(b => b.id === lastBooking.id);
      return index !== -1 ? index + 1 : null;
    }, [lastBooking, bookings]);

    return (
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
                  <div className="flex justify-between items-start">
                    <p className="text-[10px] uppercase tracking-[3px] text-muted-foreground">Priority Pass</p>
                    {queueNumber && (
                      <div className="bg-gold text-black text-[10px] font-black px-2 py-0.5 rounded-sm">
                        ANTREAN #{queueNumber}
                      </div>
                    )}
                  </div>
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
  };

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
                    <Button onClick={handleLogin} className="w-full bg-gold text-black font-black uppercase tracking-widest h-12 rounded-sm">
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
    <ErrorBoundary>
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
        <NotesModal />
        <EditBookingModal />
        <PolicyModal />
        <AdminLoginModal />
        <Toaster position="top-center" theme="dark" richColors />
      </div>
    </ErrorBoundary>
  );
}
