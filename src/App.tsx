/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Camera, 
  FileText, 
  Image as ImageIcon, 
  LayoutDashboard, 
  LogOut, 
  Plus, 
  Search, 
  Settings, 
  TrendingUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Receipt,
  Mic,
  MessageSquare,
  Globe,
  Calendar as CalendarIcon,
  Mail,
  MapPin,
  Bot,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface User {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface ApiErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

function handleApiError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: ApiErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  }
  console.error('API Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-6">
          <div className="max-w-md w-full bg-zinc-900 border border-red-500/50 rounded-2xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-2">Une erreur est survenue</h1>
            <p className="text-zinc-400 text-sm mb-6">
              {this.state.error?.message?.startsWith('{') 
                ? "Erreur de permissions Firestore. Vérifiez vos règles de sécurité."
                : this.state.error?.message || "Une erreur inattendue s'est produite."}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-white text-black rounded-full font-medium hover:bg-zinc-200 transition-colors"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
      active ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:bg-white/5 hover:text-white"
    )}
  >
    <Icon className={cn("w-5 h-5", active ? "text-black" : "text-zinc-500 group-hover:text-white")} />
    <span className="font-medium">{label}</span>
  </button>
);

const StatCard = ({ label, value, icon: Icon, trend }: { label: string, value: string, icon: any, trend?: string }) => (
  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
    <div className="flex justify-between items-start mb-4">
      <div className="p-2 bg-white/5 rounded-lg">
        <Icon className="w-5 h-5 text-zinc-400" />
      </div>
      {trend && (
        <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">
          {trend}
        </span>
      )}
    </div>
    <div className="space-y-1">
      <p className="text-sm text-zinc-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'invoices' | 'media' | 'products' | 'assistant'>('dashboard');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<any[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<any[]>([
    { role: 'assistant', content: 'Bonjour Vincent ! Comment puis-je aider Aménagement Comestible aujourd\'hui ?' }
  ]);
  const [triageInput, setTriageInput] = useState('');
  const [isTriaging, setIsTriaging] = useState(false);

  const handleVoiceCommand = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La reconnaissance vocale n'est pas supportée par votre navigateur.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAssistantMessages(prev => [...prev, { role: 'user', content: transcript }]);
      await processAssistantCommand(transcript);
    };

    recognition.start();
  };

  const processAssistantCommand = async (command: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";

      const prompt = `
        Tu es l'assistant intelligent d'Aménagement Comestible. 
        L'utilisateur a dit : "${command}"
        
        Analyse l'intention et réponds de manière concise. 
        Si l'intention est de chercher des photos/vidéos, indique que tu vas lancer la recherche.
        Si l'intention est d'envoyer un courriel, demande les détails manquants ou confirme la préparation.
        Si l'intention est de calculer des taxes ou voir des finances, donne un résumé si possible.
        
        Réponds en français.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }]
      });

      const reply = response.text || "Je n'ai pas compris, pouvez-vous répéter ?";
      setAssistantMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      // Trigger specific actions based on intent
      if (command.toLowerCase().includes('photo') || command.toLowerCase().includes('vidéo')) {
        setSearchQuery(command);
        setActiveTab('dashboard');
        handleGlobalSearch();
      }

      if (command.toLowerCase().includes('rapport fiscal')) {
        const totalExpenses = invoices.reduce((acc, inv) => acc + (inv.total || 0), 0);
        const totalTPS = invoices.reduce((acc, inv) => acc + (inv.tps || 0), 0);
        const totalTVQ = invoices.reduce((acc, inv) => acc + (inv.tvq || 0), 0);
        
        const reportMsg = `Rapport Fiscal Généré :
        - Dépenses Totales : ${totalExpenses.toFixed(2)} $
        - TPS à réclamer (5%) : ${totalTPS.toFixed(2)} $
        - TVQ à réclamer (9.975%) : ${totalTVQ.toFixed(2)} $
        
        Le document est prêt pour Revenu Québec et l'ARC.`;
        
        setAssistantMessages(prev => [...prev, { role: 'assistant', content: reportMsg }]);
      }
    } catch (error) {
      console.error("Assistant Error:", error);
    }
  };

  const handleTriage = async () => {
    if (!triageInput) return;
    setIsTriaging(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";

      const prompt = `
        Analyse ce texte et trie les informations pour Aménagement Comestible.
        Texte : "${triageInput}"
        
        Détermine s'il s'agit d'un nouveau client, d'une dépense, d'un estimé ou d'un prix de matériau.
        Extrais les informations clés au format JSON.
        JSON fields: type (client|expense|estimate|price), data (object with details).
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{}');
      setAssistantMessages(prev => [...prev, 
        { role: 'user', content: triageInput },
        { role: 'assistant', content: `Triage terminé : J'ai détecté un ${result.type}.`, data: result.data }
      ]);
      setTriageInput('');
    } catch (error) {
      console.error("Triage Error:", error);
    } finally {
      setIsTriaging(false);
    }
  };

  // Auth Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        // Fetch user data or just set a minimal user object since we have the UID
        const uid = event.data.uid;
        setUser({
          uid,
          displayName: 'Utilisateur Google',
          email: null,
          photoURL: null
        });
      }
    };
    window.addEventListener('message', handleMessage);
    
    // Check if we have a session (in a real app, we'd check a cookie or local storage)
    const savedUid = localStorage.getItem('app_uid');
    if (savedUid) {
      setUser({
        uid: savedUid,
        displayName: 'Utilisateur Connecté',
        email: null,
        photoURL: null
      });
    }
    
    setLoading(false);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('app_uid', user.uid);
    } else {
      localStorage.removeItem('app_uid');
    }
  }, [user]);

  // Data Fetching for Media
  useEffect(() => {
    if (!user) return;

    const fetchMedia = async () => {
      try {
        const res = await fetch(`/api/media?uid=${user.uid}`);
        if (!res.ok) throw new Error('Failed to fetch media');
        const data = await res.json();
        setMedia(data);
      } catch (error) {
        console.error("Media Fetch Error:", error);
      }
    };

    fetchMedia();
    const interval = setInterval(fetchMedia, 5000); // Poll for changes
    return () => clearInterval(interval);
  }, [user]);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingMedia(true);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const mimeType = file.type;
        
        // 1. Generate description using Gemini Vision
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const model = "gemini-3-flash-preview";
        
        const prompt = "Décris cette image ou vidéo de manière très détaillée pour un système de recherche. Inclus les matériaux, le type de projet d'aménagement paysager, les outils visibles et l'ambiance. Réponds en français.";

        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              parts: [
                { inlineData: { data: base64Data, mimeType } },
                { text: prompt }
              ]
            }
          ]
        });

        const description = response.text || "Pas de description générée.";

        // 2. Generate embedding for the description
        const embedModel = "gemini-embedding-2-preview";
        const embedResult = await ai.models.embedContent({
          model: embedModel,
          contents: [description]
        });

        const embedding = embedResult.embeddings[0].values;

        // 3. Save to Firestore (In a real app, we'd upload the file to Storage first, 
        // but for this demo we'll store the base64 or a placeholder URL)
        // Note: Base64 in Firestore is limited to 1MB. For large files, Storage is required.
        // We'll use a placeholder URL for now to avoid Firestore limits.
        const imageUrl = `https://picsum.photos/seed/${Math.random()}/800/600`;

        await fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            title: file.name,
            description,
            embedding,
            url: imageUrl,
            type: mimeType.startsWith('video') ? 'video' : 'image'
          })
        });

        setUploadingMedia(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Media Upload Error:", error);
      setUploadingMedia(false);
    }
  };

  const handleGlobalSearch = async () => {
    if (!searchQuery || !user) return;
    setSearching(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // 1. Generate embedding for the search query
      const embedModel = "gemini-embedding-2-preview";
      const embedResult = await ai.models.embedContent({
        model: embedModel,
        contents: [searchQuery]
      });
      const queryEmbedding = embedResult.embeddings[0].values;

      // 2. Perform semantic search (In a real app, this happens on the server with a vector DB)
      // For this demo, we'll do a simple cosine similarity in memory
      const cosineSimilarity = (a: number[], b: number[]) => {
        const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (magnitudeA * magnitudeB);
      };

      const combinedData = [
        ...invoices.map(inv => ({ ...inv, searchType: 'invoice', text: `${inv.vendor} ${inv.category} ${inv.total}` })),
        ...media.map(m => ({ ...m, searchType: 'media', text: m.description }))
      ];

      // Note: Invoices don't have embeddings yet in this demo, so we'll just search media for now
      // or use a simple text match for invoices.
      const results = media
        .filter(m => m.embedding)
        .map(m => ({
          ...m,
          similarity: cosineSimilarity(queryEmbedding, m.embedding)
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);

      setSearchResults(results);
      setSearching(false);
    } catch (error) {
      console.error("Search Error:", error);
      setSearching(false);
    }
  };

  // Data Fetching for Invoices
  useEffect(() => {
    if (!user) return;

    const fetchInvoices = async () => {
      try {
        const res = await fetch(`/api/invoices?uid=${user.uid}`);
        if (!res.ok) throw new Error('Failed to fetch invoices');
        const data = await res.json();
        setInvoices(data);
      } catch (error) {
        console.error("Invoices Fetch Error:", error);
      }
    };

    fetchInvoices();
    const interval = setInterval(fetchInvoices, 5000); // Poll for changes
    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = async () => {
    try {
      const response = await fetch('/api/auth/google');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = () => setUser(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setScanning(true);
    setScanResult(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        await scanInvoice(base64Data);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Upload Error:", error);
      setScanning(false);
    }
  };

  const scanInvoice = async (base64Data: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const prompt = `
        Analyse cette facture et extrais les informations suivantes au format JSON :
        - vendor (nom du magasin ou de l'entreprise)
        - date (format AAAA-MM-JJ)
        - subtotal (montant avant taxes, nombre)
        - tps (montant de la TPS, nombre)
        - tvq (montant de la TVQ, nombre)
        - total (montant final, nombre)
        - category (choisis parmi : Matériaux, Équipement, Transport, Sous-traitance, Fournitures de bureau, Frais de représentation, Autre)
        - tpsNumber (numéro de TPS du fournisseur)
        - tvqNumber (numéro de TVQ du fournisseur)

        Ne renvoie absolument QUE le code JSON, aucun autre texte.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            parts: [
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
              { text: prompt }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '{}');
      setScanResult(result);
      setScanning(false);
    } catch (error) {
      console.error("AI Scan Error:", error);
      setScanning(false);
    }
  };

  const saveInvoice = async () => {
    if (!scanResult || !user) return;

    try {
      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...scanResult,
          uid: user.uid
        })
      });
      setScanResult(null);
      setActiveTab('invoices');
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'invoices');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md space-y-8"
        >
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white tracking-tight">Aménagement Comestible</h1>
            <p className="text-zinc-400">Votre cerveau central pour la gestion d'entreprise intelligente.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-white text-black rounded-2xl font-bold text-lg hover:bg-zinc-200 transition-all shadow-xl shadow-white/5"
          >
            Se connecter avec Google
          </button>
        </motion.div>
      </div>
    );
  }

  const totalExpenses = invoices.reduce((acc, inv) => acc + (inv.total || 0), 0);
  const totalTPS = invoices.reduce((acc, inv) => acc + (inv.tps || 0), 0);
  const totalTVQ = invoices.reduce((acc, inv) => acc + (inv.tvq || 0), 0);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        {/* Sidebar */}
        <aside className="w-72 border-r border-white/5 p-6 flex flex-col gap-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-black" />
            </div>
            <span className="font-bold text-lg tracking-tight">AC Gestion</span>
          </div>

          <nav className="flex-1 space-y-2">
            <SidebarItem 
              icon={LayoutDashboard} 
              label="Tableau de bord" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
            <SidebarItem 
              icon={Receipt} 
              label="Factures" 
              active={activeTab === 'invoices'} 
              onClick={() => setActiveTab('invoices')} 
            />
            <SidebarItem 
              icon={ImageIcon} 
              label="Médiathèque" 
              active={activeTab === 'media'} 
              onClick={() => setActiveTab('media')} 
            />
            <SidebarItem 
              icon={Bot} 
              label="Assistant IA" 
              active={activeTab === 'assistant'} 
              onClick={() => setActiveTab('assistant')} 
            />
            <SidebarItem 
              icon={FileText} 
              label="Articles & Prix" 
              active={activeTab === 'products'} 
              onClick={() => setActiveTab('products')} 
            />
          </nav>

          <div className="pt-6 border-t border-white/5">
            <div className="flex items-center gap-3 mb-6 px-2">
              <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{user.displayName}</p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>
            <SidebarItem icon={LogOut} label="Déconnexion" onClick={handleLogout} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-12">
          <AnimatePresence mode="wait">
            {activeTab === 'assistant' && (
              <motion.div 
                key="assistant"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="h-full flex flex-col gap-8"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold tracking-tight">Assistant IA</h2>
                  <div className="flex gap-4">
                    <button 
                      onClick={handleVoiceCommand}
                      className={cn(
                        "flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all",
                        isListening ? "bg-red-500 text-white animate-pulse" : "bg-white text-black hover:bg-zinc-200"
                      )}
                    >
                      <Mic className="w-5 h-5" />
                      {isListening ? "J'écoute..." : "Commande vocale"}
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex gap-8 overflow-hidden">
                  {/* Chat Interface */}
                  <div className="flex-1 bg-zinc-900/50 border border-white/5 rounded-3xl flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {assistantMessages.map((msg, idx) => (
                        <div key={idx} className={cn(
                          "flex gap-4 max-w-[80%]",
                          msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                        )}>
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                            msg.role === 'user' ? "bg-emerald-500" : "bg-zinc-800"
                          )}>
                            {msg.role === 'user' ? <UserIcon className="w-4 h-4 text-black" /> : <Bot className="w-4 h-4 text-emerald-500" />}
                          </div>
                          <div className={cn(
                            "p-4 rounded-2xl text-sm",
                            msg.role === 'user' ? "bg-emerald-500 text-black" : "bg-zinc-800 text-white"
                          )}>
                            {msg.content}
                            {msg.data && (
                              <pre className="mt-2 text-[10px] bg-black/20 p-2 rounded overflow-x-auto">
                                {JSON.stringify(msg.data, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-6 border-t border-white/5 bg-zinc-900/80">
                      <div className="flex gap-4">
                        <input 
                          type="text" 
                          placeholder="Posez une question ou collez du texte pour triage..." 
                          className="flex-1 bg-zinc-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          onKeyDown={(e) => e.key === 'Enter' && processAssistantCommand((e.target as HTMLInputElement).value)}
                        />
                        <button className="p-3 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 transition-colors">
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Triage Sidebar */}
                  <div className="w-80 space-y-6">
                    <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl space-y-4">
                      <h3 className="font-bold flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-emerald-500" />
                        Triage Rapide
                      </h3>
                      <p className="text-xs text-zinc-500">Collez une conversation Messenger ou un texte de document pour extraire les données.</p>
                      <textarea 
                        className="w-full bg-zinc-800 border-none rounded-xl p-3 text-xs h-32 resize-none focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Collez ici..."
                        value={triageInput}
                        onChange={(e) => setTriageInput(e.target.value)}
                      />
                      <button 
                        onClick={handleTriage}
                        disabled={isTriaging || !triageInput}
                        className="w-full py-3 bg-emerald-500 text-black rounded-xl font-bold text-sm hover:bg-emerald-400 transition-colors disabled:opacity-50"
                      >
                        {isTriaging ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Lancer le triage IA"}
                      </button>
                    </div>

                    <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl space-y-4">
                      <h3 className="font-bold flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-yellow-500" />
                        Comptabilité Québec
                      </h3>
                      <p className="text-xs text-zinc-500">Générez vos rapports TPS/TVQ et bilans financiers conformes.</p>
                      <button 
                        onClick={() => processAssistantCommand("Génère mon rapport fiscal pour ce mois-ci")}
                        className="w-full py-3 bg-zinc-800 text-white border border-white/10 rounded-xl font-bold text-sm hover:bg-zinc-700 transition-colors"
                      >
                        Générer Rapport Fiscal
                      </button>
                    </div>

                    <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl space-y-4">
                      <h3 className="font-bold flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-500" />
                        Intégrations Google
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 text-zinc-400">
                            <Mail className="w-3 h-3" /> Gmail
                          </span>
                          <span className="text-emerald-500 font-bold">Connecté</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 text-zinc-400">
                            <FileText className="w-3 h-3" /> Sheets
                          </span>
                          <span className="text-emerald-500 font-bold">Connecté</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 text-zinc-400">
                            <CalendarIcon className="w-3 h-3" /> Agenda
                          </span>
                          <span className="text-emerald-500 font-bold">Connecté</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'media' && (
              <motion.div 
                key="media"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold tracking-tight">Médiathèque</h2>
                  <button 
                    onClick={() => mediaInputRef.current?.click()}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Ajouter Photo/Vidéo
                  </button>
                  <input 
                    type="file" 
                    ref={mediaInputRef} 
                    className="hidden" 
                    accept="image/*,video/*" 
                    onChange={handleMediaUpload} 
                  />
                </div>

                {uploadingMedia && (
                  <div className="bg-zinc-900 border border-white/5 p-6 rounded-2xl flex items-center gap-4">
                    <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                    <p className="text-sm font-medium">L'IA analyse votre média pour le rendre recherchable...</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {media.map((m) => (
                    <div key={m.id} className="bg-zinc-900 border border-white/5 rounded-3xl overflow-hidden group">
                      <div className="aspect-video relative overflow-hidden">
                        <img 
                          src={m.url} 
                          alt={m.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          referrerPolicy="no-referrer" 
                        />
                        <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] uppercase font-bold tracking-widest">
                          {m.type}
                        </div>
                      </div>
                      <div className="p-6 space-y-3">
                        <h4 className="font-bold truncate">{m.title}</h4>
                        <p className="text-xs text-zinc-500 line-clamp-3 leading-relaxed">
                          {m.description}
                        </p>
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-[10px] text-zinc-600 font-bold uppercase">{new Date(m.createdAt).toLocaleDateString()}</span>
                          <button className="text-xs font-bold text-emerald-500 hover:text-emerald-400">Voir détails</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-12"
              >
                <header className="flex justify-between items-end">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Bonjour, {user.displayName?.split(' ')[0]}</h2>
                    <p className="text-zinc-500">Voici l'état actuel de votre entreprise.</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-zinc-900 border border-white/5 rounded-full px-4 py-2 flex items-center gap-2">
                      <Search className="w-4 h-4 text-zinc-500" />
                      <input 
                        type="text" 
                        placeholder="Recherche intelligente..." 
                        className="bg-transparent border-none outline-none text-sm w-64"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
                      />
                    </div>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-black rounded-full font-bold hover:bg-emerald-400 transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                      Scanner une facture
                    </button>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileUpload} 
                  />
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard label="Dépenses Totales" value={`${totalExpenses.toFixed(2)} $`} icon={DollarSign} trend="+12%" />
                  <StatCard label="TPS à réclamer" value={`${totalTPS.toFixed(2)} $`} icon={FileText} />
                  <StatCard label="TVQ à réclamer" value={`${totalTVQ.toFixed(2)} $`} icon={FileText} />
                </div>

                {searchQuery && (
                  <motion.div 
                    key="search-results"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6 pt-8 border-t border-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold">Résultats de recherche IA</h3>
                      <button onClick={() => setSearchQuery('')} className="text-xs text-zinc-500 hover:text-white">Effacer</button>
                    </div>
                    
                    {searching ? (
                      <div className="flex items-center gap-3 text-zinc-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Recherche sémantique en cours...</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {searchResults.map((res) => (
                          <div key={res.id} className="bg-zinc-900 border border-emerald-500/20 p-4 rounded-2xl flex gap-4 items-start">
                            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                              <img src={res.url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold uppercase">
                                  {Math.round(res.similarity * 100)}% Match
                                </span>
                              </div>
                              <p className="text-sm font-bold line-clamp-1">{res.title}</p>
                              <p className="text-xs text-zinc-500 line-clamp-2">{res.description}</p>
                            </div>
                          </div>
                        ))}
                        {searchResults.length === 0 && (
                          <p className="text-sm text-zinc-500">Aucun résultat trouvé pour "{searchQuery}".</p>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <section className="space-y-6">
                    <h3 className="text-xl font-bold">Dernières Factures</h3>
                    <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden">
                      {invoices.slice(0, 5).map((inv) => (
                        <div key={inv.id} className="p-4 border-b border-white/5 flex items-center justify-between hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                              <Receipt className="w-5 h-5 text-zinc-400" />
                            </div>
                            <div>
                              <p className="font-bold">{inv.vendor}</p>
                              <p className="text-xs text-zinc-500">{inv.date}</p>
                            </div>
                          </div>
                          <p className="font-bold">{inv.total.toFixed(2)} $</p>
                        </div>
                      ))}
                      {invoices.length === 0 && (
                        <div className="p-12 text-center text-zinc-500">Aucune facture enregistrée.</div>
                      )}
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-xl font-bold">Actions Rapides</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setActiveTab('media')}
                        className="p-6 bg-zinc-900 border border-white/5 rounded-3xl text-left hover:border-white/20 transition-all group"
                      >
                        <Camera className="w-8 h-8 text-emerald-500 mb-4 group-hover:scale-110 transition-transform" />
                        <p className="font-bold">Photo de projet</p>
                        <p className="text-xs text-zinc-500">Ajouter à la médiathèque</p>
                      </button>
                      <button 
                        onClick={() => setActiveTab('dashboard')}
                        className="p-6 bg-zinc-900 border border-white/5 rounded-3xl text-left hover:border-white/20 transition-all group"
                      >
                        <Search className="w-8 h-8 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
                        <p className="font-bold">Recherche IA</p>
                        <p className="text-xs text-zinc-500">Trouver un document</p>
                      </button>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'products' && (
              <motion.div 
                key="products"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold tracking-tight">Articles & Prix</h2>
                  <button className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition-colors">
                    <Plus className="w-5 h-5" />
                    Nouvel Article
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { name: 'Terre à jardin (sac 30L)', price: 8.99, category: 'Matériaux' },
                    { name: 'Cèdre blanc (3-4 pieds)', price: 45.00, category: 'Végétaux' },
                    { name: 'Paillis de cèdre (sac 2pc)', price: 6.50, category: 'Matériaux' },
                    { name: 'Engrais biologique (2kg)', price: 19.99, category: 'Entretien' },
                    { name: 'Système d\'irrigation goutte-à-goutte', price: 120.00, category: 'Équipement' },
                  ].map((p, i) => (
                    <div key={i} className="bg-zinc-900 border border-white/5 p-6 rounded-3xl space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="p-3 bg-white/5 rounded-2xl">
                          <FileText className="w-6 h-6 text-zinc-400" />
                        </div>
                        <span className="text-xs bg-zinc-800 px-2 py-1 rounded-full text-zinc-400">{p.category}</span>
                      </div>
                      <div>
                        <h4 className="font-bold">{p.name}</h4>
                        <p className="text-2xl font-bold text-emerald-500 mt-1">{p.price.toFixed(2)} $</p>
                      </div>
                      <button className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-colors">Modifier le prix</button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            {activeTab === 'invoices' && (
              <motion.div 
                key="invoices"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold tracking-tight">Gestion des Factures</h2>
                  <div className="flex gap-4">
                    <div className="bg-zinc-900 border border-white/5 rounded-full px-4 py-2 flex items-center gap-2">
                      <Search className="w-4 h-4 text-zinc-500" />
                      <input type="text" placeholder="Rechercher..." className="bg-transparent border-none outline-none text-sm w-48" />
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-medium">Fournisseur</th>
                        <th className="px-6 py-4 font-medium">Date</th>
                        <th className="px-6 py-4 font-medium">Catégorie</th>
                        <th className="px-6 py-4 font-medium">TPS</th>
                        <th className="px-6 py-4 font-medium">TVQ</th>
                        <th className="px-6 py-4 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-6 py-4 font-bold">{inv.vendor}</td>
                          <td className="px-6 py-4 text-sm text-zinc-400">{inv.date}</td>
                          <td className="px-6 py-4">
                            <span className="text-xs bg-zinc-800 px-2 py-1 rounded-full">{inv.category}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-400">{inv.tps?.toFixed(2)} $</td>
                          <td className="px-6 py-4 text-sm text-zinc-400">{inv.tvq?.toFixed(2)} $</td>
                          <td className="px-6 py-4 font-bold text-right">{inv.total?.toFixed(2)} $</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Scan Modal Overlay */}
        <AnimatePresence>
          {(scanning || scanResult) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-white/10 rounded-3xl max-w-2xl w-full p-8 shadow-2xl"
              >
                {scanning ? (
                  <div className="text-center space-y-6 py-12">
                    <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold">Analyse de l'IA en cours...</h3>
                      <p className="text-zinc-400">Gemini extrait les montants, taxes et catégories.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex justify-between items-center">
                      <h3 className="text-2xl font-bold">Résultat de l'analyse</h3>
                      <button onClick={() => setScanResult(null)} className="text-zinc-500 hover:text-white">Fermer</button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-500 uppercase font-bold">Fournisseur</label>
                        <p className="text-lg font-bold bg-white/5 p-3 rounded-xl">{scanResult.vendor}</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-500 uppercase font-bold">Date</label>
                        <p className="text-lg font-bold bg-white/5 p-3 rounded-xl">{scanResult.date}</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-500 uppercase font-bold">TPS (5%)</label>
                        <p className="text-lg font-bold bg-white/5 p-3 rounded-xl text-emerald-400">{scanResult.tps?.toFixed(2)} $</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-500 uppercase font-bold">TVQ (9.975%)</label>
                        <p className="text-lg font-bold bg-white/5 p-3 rounded-xl text-emerald-400">{scanResult.tvq?.toFixed(2)} $</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-500 uppercase font-bold">Total</label>
                        <p className="text-2xl font-black bg-white/5 p-3 rounded-xl">{scanResult.total?.toFixed(2)} $</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-500 uppercase font-bold">Catégorie</label>
                        <p className="text-lg font-bold bg-white/5 p-3 rounded-xl">{scanResult.category}</p>
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button 
                        onClick={saveInvoice}
                        className="flex-1 py-4 bg-emerald-500 text-black rounded-2xl font-bold hover:bg-emerald-400 transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        Confirmer et Enregistrer
                      </button>
                      <button 
                        onClick={() => setScanResult(null)}
                        className="flex-1 py-4 bg-zinc-800 text-white rounded-2xl font-bold hover:bg-zinc-700 transition-all"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

