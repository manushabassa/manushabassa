import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  UtensilsCrossed,
  CheckSquare,
  BarChart2,
  Trash2,
  NotebookText,
  Calendar as CalendarIcon,
  BookText,
  Shield,
  Key,
  Save,
  Wand2,
  Search,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

/***********************************
 * ⚠️ IMPORTANT SECURITY NOTE
 * Client-side storage of API keys is risky. This demo encrypts the API key
 * with a passphrase using the Web Crypto API before saving to localStorage.
 * Keep the passphrase private; without it the app cannot decrypt the key.
 * In production, proxy requests via your own backend and NEVER ship secrets
 * to the client.
 ***********************************/

// -----------------------------------------------------------------------------
// LocalStorage helpers
// -----------------------------------------------------------------------------
const safeStorage = typeof window !== "undefined" ? window.localStorage : undefined;
const lsGet = (key, fallback) => {
  try { const raw = safeStorage?.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};
const lsSet = (key, value) => { try { safeStorage?.setItem(key, JSON.stringify(value)); } catch {} };
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2,9)}`);

// -----------------------------------------------------------------------------
// Minimal food DB (unchanged)
// -----------------------------------------------------------------------------
const FOOD_DB = {
  "banana": { unit: "medium", calories: 105, protein: 1.3, carbs: 27, fat: 0.3 },
  "egg": { unit: "large", calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
  "chicken breast": { unit: "100 g", calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  "rice, cooked": { unit: "1 cup", calories: 206, protein: 4.3, carbs: 45, fat: 0.4 },
  "milk, 2%": { unit: "1 cup", calories: 122, protein: 8, carbs: 12, fat: 5 },
  "oats": { unit: "1/2 cup dry", calories: 154, protein: 5.3, carbs: 27, fat: 2.6 },
  "apple": { unit: "medium", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
};

// -----------------------------------------------------------------------------
// Types (JSDoc for DX)
// -----------------------------------------------------------------------------
/** @typedef {{ id: string, date: string, name: string, quantity: number, unit: string, calories: number, protein?: number, carbs?: number, fat?: number }} FoodEntry */
/** @typedef {{ id: string, name: string, createdAt: string }} Habit */
/** @typedef {{ done: boolean, note?: string }} HabitStatus */
/** @typedef {{ id: string, date: string, raw: string, summary?: string, tags?: string[], mood?: string }} DiaryEntry */

// -----------------------------------------------------------------------------
// Storage keys
// -----------------------------------------------------------------------------
const LS_MEALS = "fp_meals_v1";                 // FoodEntry[]
const LS_HABITS = "fp_habits_v1";               // Habit[]
const LS_HABIT_STATE = "fp_habit_state_v1";     // { [dateStr]: { [habitId]: HabitStatus } }
const LS_DIARY = "fp_diary_v1";                 // DiaryEntry[]
const LS_OPENAI_ENC = "fp_openai_encrypted_v1"; // { iv: string, salt: string, data: string }

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------
const todayStr = () => new Date().toISOString().slice(0,10); // YYYY-MM-DD
const fmtNum = (n) => (Math.round((n || 0) * 10) / 10).toString();

// WebCrypto: derive AES-GCM key from passphrase + salt
async function deriveKey(passphrase, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { key, saltB64: btoa(String.fromCharCode(...salt)) };
}

async function encryptToB64(passphrase, plaintext) {
  const { key, saltB64 } = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const ivB64 = btoa(String.fromCharCode(...iv));
  const dataB64 = btoa(String.fromCharCode(...new Uint8Array(ct)));
  return { salt: saltB64, iv: ivB64, data: dataB64 };
}

async function decryptFromB64(passphrase, encBlob) {
  const { key } = await deriveKey(passphrase, encBlob.salt);
  const iv = Uint8Array.from(atob(encBlob.iv), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encBlob.data), c => c.charCodeAt(0));
  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(ptBuf);
}

// -----------------------------------------------------------------------------
// OpenAI helpers (Responses API)
// -----------------------------------------------------------------------------
async function openaiSummarize({ apiKey, text, date, model = "gpt-4o-mini" }) {
  const prompt = [
    {
      role: "system",
      content:
        "You are a structured diary assistant. Given a user's free-form daily log, produce a concise JSON object with: summary (<=60 words), mood (one of: great, good, okay, meh, bad), and 3-6 short tags. Keep it JSON only.",
    },
    {
      role: "user",
      content: `Date: ${date}\nEntry: ${text}`,
    },
  ];

  // Using the Responses API (recommended)
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      response_format: { type: "json_object" },
      max_output_tokens: 300,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${t}`);
  }
  const data = await res.json();
  // Responses API returns output in data.output[0].content[0].text (as of 2025)
  // Fallbacks for earlier shapes.
  const textOut = data?.output?.[0]?.content?.[0]?.text || data?.output_text || JSON.stringify(data);
  let parsed;
  try { parsed = JSON.parse(textOut); } catch { parsed = { summary: textOut, mood: "okay", tags: [] }; }
  return parsed;
}

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------
export default function FitnessPalDiaryApp() {
  const [activeTab, setActiveTab] = useState("meals");
  const [date, setDate] = useState(todayStr());

  /** @type {[FoodEntry[], Function]} */
  const [meals, setMeals] = useState(() => lsGet(LS_MEALS, []));
  /** @type {[Habit[], Function]} */
  const [habits, setHabits] = useState(() => lsGet(LS_HABITS, []));
  /** @type {[Record<string, Record<string, HabitStatus>>, Function]} */
  const [habitState, setHabitState] = useState(() => lsGet(LS_HABIT_STATE, {}));
  /** @type {[DiaryEntry[], Function]} */
  const [diary, setDiary] = useState(() => lsGet(LS_DIARY, []));

  useEffect(() => { lsSet(LS_MEALS, meals); }, [meals]);
  useEffect(() => { lsSet(LS_HABITS, habits); }, [habits]);
  useEffect(() => { lsSet(LS_HABIT_STATE, habitState); }, [habitState]);
  useEffect(() => { lsSet(LS_DIARY, diary); }, [diary]);

  // OpenAI key management
  const [encBlob, setEncBlob] = useState(() => lsGet(LS_OPENAI_ENC, null));
  const [passphrase, setPassphrase] = useState(""); // kept only in memory
  const [apiStatus, setApiStatus] = useState("locked"); // locked | ready | error

  useEffect(() => { setApiStatus(encBlob ? "locked" : "ready"); }, [encBlob]);

  const unlockWithPassphrase = async () => {
    if (!encBlob || !passphrase) return;
    try {
      await decryptFromB64(passphrase, encBlob); // probe decryption
      setApiStatus("ready");
    } catch (e) {
      setApiStatus("error");
    }
  };

  const saveApiKey = async (key, pass) => {
    const blob = await encryptToB64(pass, key);
    setEncBlob(blob);
    lsSet(LS_OPENAI_ENC, blob);
    setPassphrase(pass);
    setApiStatus("ready");
  };

  const clearApiKey = () => {
    setEncBlob(null);
    lsSet(LS_OPENAI_ENC, null);
    setPassphrase("");
    setApiStatus("locked");
  };

  // ---------------------------------------------------------------------------
  // Derived totals and analytics (unchanged)
  // ---------------------------------------------------------------------------
  const dayMeals = useMemo(() => meals.filter(m => m.date === date), [meals, date]);
  const totals = useMemo(() => dayMeals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [dayMeals]);

  const completion = useMemo(() => {
    const state = habitState[date] || {}; const total = habits.length || 1; const done = habits.filter(h => state[h.id]?.done).length; return { done, total, pct: Math.round((done/total)*100) };
  }, [habits, habitState, date]);

  const weekData = useMemo(() => {
    const out = [];
    const base = new Date(date);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(base.getDate() - i);
      const ds = d.toISOString().slice(0,10);
      const kcal = meals.filter(m => m.date === ds).reduce((s, m) => s + (m.calories||0), 0);
      out.push({ day: ds.slice(5), calories: Math.round(kcal) });
    }
    return out;
  }, [meals, date]);

  // ---------------------------------------------------------------------------
  // Meals actions
  // ---------------------------------------------------------------------------
  const addMeal = ({ name, quantity, base }) => {
    const q = Number(quantity) || 1;
    const entry = {
      id: uid(),
      date,
      name: name.trim(),
      quantity: q,
      unit: base?.unit || "serving",
      calories: q * (base?.calories || 0),
      protein: q * (base?.protein || 0),
      carbs: q * (base?.carbs || 0),
      fat: q * (base?.fat || 0),
    };
    setMeals(prev => [entry, ...prev]);
  };
  const removeMeal = (id) => setMeals(prev => prev.filter(m => m.id !== id));

  // ---------------------------------------------------------------------------
  // Habits actions
  // ---------------------------------------------------------------------------
  const addHabit = (name) => setHabits(prev => [{ id: uid(), name: name.trim(), createdAt: new Date().toISOString() }, ...prev]);
  const removeHabit = (id) => setHabits(prev => prev.filter(h => h.id !== id));
  const toggleHabit = (id) => setHabitState(prev => {
    const day = { ...(prev[date]||{}) };
    const cur = day[id]?.done || false; day[id] = { done: !cur, note: day[id]?.note };
    return { ...prev, [date]: day };
  });
  const setHabitNote = (id, note) => setHabitState(prev => {
    const day = { ...(prev[date]||{}) }; day[id] = { done: day[id]?.done || false, note };
    return { ...prev, [date]: day };
  });

  // ---------------------------------------------------------------------------
  // Diary actions
  // ---------------------------------------------------------------------------
  const diaryForDate = useMemo(() => diary.filter(d => d.date === date), [diary, date]);
  const addDiaryRaw = (raw) => setDiary(prev => [{ id: uid(), date, raw }, ...prev]);
  const removeDiary = (id) => setDiary(prev => prev.filter(x => x.id !== id));

  const summarizeAndSave = async (raw) => {
    if (!raw?.trim()) return;
    let apiKey = null;
    if (encBlob) {
      try { apiKey = await decryptFromB64(passphrase, encBlob); }
      catch { setApiStatus("error"); throw new Error("Passphrase incorrect or key corrupted"); }
    }
    if (!apiKey) throw new Error("No API key. Add it in Settings.");
    const structured = await openaiSummarize({ apiKey, text: raw, date });
    const entry = { id: uid(), date, raw, summary: structured.summary, tags: structured.tags, mood: structured.mood };
    setDiary(prev => [entry, ...prev]);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <motion.div initial={{opacity:0, y:-8}} animate={{opacity:1, y:0}} className="flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6" />
            <h1 className="font-semibold text-xl">FitnessPal • Diary</h1>
          </motion.div>
          <div className="ml-auto flex items-center gap-2">
            <CalendarIcon className="w-4 h-4"/>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <SettingsButton
              encBlob={encBlob}
              apiStatus={apiStatus}
              passphrase={passphrase}
              onChangePass={setPassphrase}
              onUnlock={unlockWithPassphrase}
              onSaveKey={saveApiKey}
              onClear={clearApiKey}
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <SummaryCard title="Calories" value={Math.round(totals.calories)} suffix="kcal" />
          <SummaryCard title="Protein" value={fmtNum(totals.protein)} suffix="g" />
          <SummaryCard title="Carbs" value={fmtNum(totals.carbs)} suffix="g" />
          <SummaryCard title="Fat" value={fmtNum(totals.fat)} suffix="g" />
          <motion.div whileHover={{scale:1.01}} className="rounded-2xl shadow-sm bg-white p-3 border">
            <div className="text-xs text-slate-500">Habits</div>
            <div className="flex items-end gap-2">
              <div className="text-2xl font-semibold">{completion.pct}%</div>
              <div className="text-xs text-slate-500">{completion.done}/{completion.total} done</div>
            </div>
          </motion.div>
          <motion.div whileHover={{scale:1.01}} className="rounded-2xl shadow-sm bg-white p-3 border">
            <div className="text-xs text-slate-500">Diary</div>
            <div className="flex items-end gap-2">
              <div className="text-2xl font-semibold">{diaryForDate.length}</div>
              <div className="text-xs text-slate-500">entries today</div>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <Tabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "meals" && (
          <section className="grid md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <AddMealForm onAdd={addMeal} />
              <QuickAdd onPick={(name) => addMeal({ name, quantity: 1, base: FOOD_DB[name] })} />
            </div>
            <div className="md:col-span-3">
              <MealList meals={dayMeals} onDelete={removeMeal} />
            </div>
          </section>
        )}

        {activeTab === "habits" && (
          <section className="grid md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <AddHabitForm onAdd={addHabit} />
              <HabitManager habits={habits} onRemove={removeHabit} />
            </div>
            <div className="md:col-span-3">
              <HabitBoard date={date} habits={habits} state={habitState[date]||{}} onToggle={toggleHabit} onNote={setHabitNote} />
            </div>
          </section>
        )}

        {activeTab === "diary" && (
          <DiarySection
            date={date}
            entries={diaryForDate}
            onQuickSave={addDiaryRaw}
            onAIGenerate={summarizeAndSave}
            onDelete={removeDiary}
          />
        )}

        {activeTab === "analytics" && (
          <section className="rounded-2xl shadow-sm bg-white border p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><BarChart2 className="w-5 h-5"/> 7‑day calories</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="calories" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-6 text-xs text-slate-500">
        Local-first demo. API key is encrypted with your passphrase and stored in your browser. For production, route OpenAI calls through your own backend.
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// UI Bits
// -----------------------------------------------------------------------------
function Tabs({ activeTab, onChange }) {
  const TabBtn = ({ id, icon: Icon, label }) => (
    <button onClick={() => onChange(id)} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition ${activeTab===id?"bg-slate-900 text-white border-slate-900":"bg-white text-slate-700 border"}`}>
      <Icon className="w-4 h-4"/> {label}
    </button>
  );
  return (
    <div className="flex items-center gap-2 mb-4">
      <TabBtn id="meals" icon={UtensilsCrossed} label="Meals" />
      <TabBtn id="habits" icon={CheckSquare} label="Habits" />
      <TabBtn id="diary" icon={BookText} label="Diary" />
      <TabBtn id="analytics" icon={BarChart2} label="Analytics" />
    </div>
  );
}

function SummaryCard({ title, value, suffix }) {
  return (
    <motion.div whileHover={{scale:1.01}} className="rounded-2xl shadow-sm bg-white p-3 border">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-2xl font-semibold">{value}<span className="text-base font-normal text-slate-500 ml-1">{suffix}</span></div>
    </motion.div>
  );
}

function AddMealForm({ onAdd }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const base = FOOD_DB[name.toLowerCase?.() || name] || null;
  const canAdd = name.trim().length > 0 && quantity > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canAdd) return;
    onAdd({ name, quantity, base });
    setName(""); setQuantity(1);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl shadow-sm bg-white border p-4 mb-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2"><NotebookText className="w-5 h-5"/> Add meal</h3>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-xs text-slate-600">Food</label>
          <input list="fooddb" value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g., chicken breast" className="w-full border rounded-md px-3 py-2" />
          <datalist id="fooddb">
            {Object.keys(FOOD_DB).map(k => <option key={k} value={k}>{k}</option>)}
          </datalist>
          {base && (
            <p className="mt-1 text-xs text-slate-500">per {base.unit}: {base.calories} kcal • P {fmtNum(base.protein)} g • C {fmtNum(base.carbs)} g • F {fmtNum(base.fat)} g</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-600">Servings</label>
            <input type="number" min={0.1} step={0.1} value={quantity} onChange={(e)=>setQuantity(parseFloat(e.target.value))} className="w-full border rounded-md px-3 py-2" />
          </div>
          <div className="flex items-end">
            <button type="submit" className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md ${canAdd?"bg-slate-900 text-white":"bg-slate-200 text-slate-500"}`}>
              <Plus className="w-4 h-4"/> Add
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function QuickAdd({ onPick }) {
  const items = Object.keys(FOOD_DB).slice(0, 6);
  return (
    <div className="rounded-2xl shadow-sm bg-white border p-4">
      <h3 className="font-semibold mb-3">Quick add</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map(n => (
          <button key={n} onClick={() => onPick(n)} className="text-left border rounded-lg px-3 py-2 hover:bg-slate-50">
            <div className="text-sm font-medium capitalize">{n}</div>
            <div className="text-xs text-slate-500">{FOOD_DB[n].calories} kcal / {FOOD_DB[n].unit}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MealList({ meals, onDelete }) {
  if (!meals.length) return (
    <div className="rounded-2xl shadow-sm bg-white border p-4">
      <p className="text-sm text-slate-500">No meals logged for this day yet.</p>
    </div>
  );

  return (
    <div className="rounded-2xl shadow-sm bg-white border">
      <div className="border-b px-4 py-3 text-sm font-semibold">Today's meals</div>
      <ul className="divide-y">
        {meals.map(m => (
          <li key={m.id} className="px-4 py-3 flex items-center gap-2">
            <div className="flex-1">
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-slate-500">{m.quantity} × {m.unit} • {Math.round(m.calories)} kcal{(m.protein||m.carbs||m.fat)?` • P ${fmtNum(m.protein)}g • C ${fmtNum(m.carbs)}g • F ${fmtNum(m.fat)}g`:''}</div>
            </div>
            <button onClick={() => onDelete(m.id)} className="p-2 rounded-md hover:bg-slate-100">
              <Trash2 className="w-4 h-4 text-slate-500"/>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddHabitForm({ onAdd }) {
  const [name, setName] = useState("");
  const add = (e) => { e.preventDefault(); if (!name.trim()) return; onAdd(name); setName(""); };
  return (
    <form onSubmit={add} className="rounded-2xl shadow-sm bg-white border p-4 mb-4">
      <h3 className="font-semibold mb-3">New habit</h3>
      <div className="flex gap-2">
        <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g., Morning stretch" className="flex-1 border rounded-md px-3 py-2" />
        <button type="submit" className={`px-3 py-2 rounded-md ${name.trim()?"bg-slate-900 text-white":"bg-slate-200 text-slate-500"}`}>Add</button>
      </div>
    </form>
  );
}

function HabitManager({ habits, onRemove }) {
  return (
    <div className="rounded-2xl shadow-sm bg-white border p-4">
      <h3 className="font-semibold mb-3">Your habits</h3>
      {!habits.length && <p className="text-sm text-slate-500">Create a habit to begin tracking.</p>}
      <ul className="space-y-2">
        {habits.map(h => (
          <li key={h.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
            <span className="flex-1">{h.name}</span>
            <button onClick={() => onRemove(h.id)} className="p-2 rounded-md hover:bg-slate-100">
              <Trash2 className="w-4 h-4 text-slate-500"/>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HabitBoard({ date, habits, state, onToggle, onNote }) {
  return (
    <div className="rounded-2xl shadow-sm bg-white border">
      <div className="border-b px-4 py-3 text-sm font-semibold flex items-center gap-2">
        <CheckSquare className="w-4 h-4"/> Habits for {date}
      </div>
      <ul className="divide-y">
        {habits.map(h => {
          const st = state[h.id] || { done: false, note: "" };
          return (
            <li key={h.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={!!st.done} onChange={() => onToggle(h.id)} className="w-4 h-4" />
                <div className="flex-1">
                  <div className="font-medium">{h.name}</div>
                  <input
                    value={st.note || ""}
                    onChange={(e)=>onNote(h.id, e.target.value)}
                    placeholder="Add a note…"
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </li>
          );
        })}
        {!habits.length && (
          <li className="px-4 py-6 text-sm text-slate-500">Nothing here yet. Add habits on the left.</li>
        )}
      </ul>
    </div>
  );
}

function DiarySection({ date, entries, onQuickSave, onAIGenerate, onDelete }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  const filtered = entries.filter(e =>
    !searchQ.trim() ||
    e.raw.toLowerCase().includes(searchQ.toLowerCase()) ||
    e.summary?.toLowerCase().includes(searchQ.toLowerCase()) ||
    (e.tags||[]).some(t => t.toLowerCase().includes(searchQ.toLowerCase()))
  );

  const quickSave = () => { if (!text.trim()) return; onQuickSave(text.trim()); setText(""); };
  const aiSave = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onAIGenerate(text.trim());
      setText("");
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid md:grid-cols-5 gap-4">
      <div className="md:col-span-2">
        <div className="rounded-2xl shadow-sm bg-white border p-4 mb-4">
          <h3 className="font-semibold mb-1 flex items-center gap-2"><BookText className="w-5 h-5"/> Today, {date}</h3>
          <p className="text-xs text-slate-500 mb-3">Write freely. Either quick-save the raw text or let the AI structure it into a summary, mood, and tags.</p>
          <textarea
            value={text}
            onChange={(e)=>setText(e.target.value)}
            rows={8}
            placeholder="What happened today?"
            className="w-full border rounded-lg p-3 text-sm"
          />
          <div className="mt-3 flex gap-2">
            <button onClick={quickSave} className="px-3 py-2 rounded-md bg-slate-200 text-slate-700 flex items-center gap-2"><Save className="w-4 h-4"/> Quick save</button>
            <button onClick={aiSave} disabled={busy} className={`px-3 py-2 rounded-md text-white flex items-center gap-2 ${busy?"bg-slate-400":"bg-slate-900"}`}>
              <Wand2 className="w-4 h-4"/>{busy?"Summarizing…":"Summarize & save"}
            </button>
          </div>
        </div>
        <div className="rounded-2xl shadow-sm bg-white border p-4">
          <h4 className="font-semibold mb-2 flex items-center gap-2"><Search className="w-4 h-4"/> Search today</h4>
          <input value={searchQ} onChange={(e)=>setSearchQ(e.target.value)} placeholder="Find by text or tag" className="w-full border rounded-md px-3 py-2 text-sm"/>
        </div>
      </div>

      <div className="md:col-span-3">
        <div className="rounded-2xl shadow-sm bg-white border">
          <div className="border-b px-4 py-3 text-sm font-semibold flex items-center gap-2">
            <BookText className="w-4 h-4"/> Entries for {date}
          </div>
          {!filtered.length && (
            <div className="px-4 py-6 text-sm text-slate-500">No entries yet.</div>
          )}
          <ul className="divide-y">
            {filtered.map(e => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    {e.summary ? (
                      <>
                        <div className="text-sm"><span className="font-semibold">Summary:</span> {e.summary}</div>
                        <div className="text-xs text-slate-500 mt-1">Mood: <span className="uppercase tracking-wide font-medium">{e.mood||"—"}</span> {e.tags?.length?`• ${e.tags.join(" · ")}`:""}</div>
                        <details className="mt-2 text-sm">
                          <summary className="cursor-pointer text-slate-700">Raw</summary>
                          <p className="text-slate-600 whitespace-pre-wrap">{e.raw}</p>
                        </details>
                      </>
                    ) : (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{e.raw}</p>
                    )}
                  </div>
                  <button onClick={() => onDelete(e.id)} className="p-2 rounded-md hover:bg-slate-100"><Trash2 className="w-4 h-4 text-slate-500"/></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function SettingsButton({ encBlob, apiStatus, passphrase, onChangePass, onUnlock, onSaveKey, onClear }) {
  const [open, setOpen] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [inputPass, setInputPass] = useState("");

  useEffect(() => { if (!open) { setInputKey(""); setInputPass(""); } }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white text-slate-700 hover:bg-slate-50">
        <Shield className="w-4 h-4"/>
        <span className="text-sm">{encBlob?"AI key: encrypted":"Add AI key"}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="max-w-md w-full rounded-2xl bg-white border shadow-xl p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Shield className="w-5 h-5"/><h3 className="font-semibold">AI Settings</h3></div>
            <p className="text-xs text-slate-500 mb-3">Your OpenAI API key is encrypted with a passphrase and saved to your browser. For serious apps, send requests via your own backend.</p>

            {!encBlob && (
              <>
                <label className="text-xs text-slate-600">OpenAI API key</label>
                <input value={inputKey} onChange={(e)=>setInputKey(e.target.value)} placeholder="sk-..." className="w-full border rounded-md px-3 py-2 mb-3"/>
                <label className="text-xs text-slate-600">Create passphrase (remember this)</label>
                <input value={inputPass} onChange={(e)=>setInputPass(e.target.value)} placeholder="••••••••" className="w-full border rounded-md px-3 py-2 mb-3"/>
                <button onClick={() => { if (!inputKey || !inputPass) return; onSaveKey(inputKey.trim(), inputPass); setOpen(false); }} className="w-full px-3 py-2 rounded-md bg-slate-900 text-white flex items-center justify-center gap-2"><Key className="w-4 h-4"/> Save encrypted</button>
              </>
            )}

            {encBlob && (
              <>
                <div className="rounded-md border p-3 mb-3 bg-slate-50 text-xs">
                  <div className="flex items-center gap-2"><Key className="w-4 h-4"/> <span className="font-medium">Status:</span> {apiStatus === "ready" ? "Ready" : apiStatus === "error" ? "Passphrase incorrect" : "Locked"}</div>
                </div>
                {apiStatus !== "ready" && (
                  <>
                    <label className="text-xs text-slate-600">Enter passphrase to unlock</label>
                    <input value={passphrase} onChange={(e)=>onChangePass(e.target.value)} placeholder="••••••••" className="w-full border rounded-md px-3 py-2 mb-3"/>
                    <button onClick={onUnlock} className="w-full px-3 py-2 rounded-md bg-slate-900 text-white">Unlock</button>
                  </>
                )}
                <button onClick={onClear} className="w-full mt-2 px-3 py-2 rounded-md border">Remove saved key</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
