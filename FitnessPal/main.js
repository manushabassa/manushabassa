import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, UtensilsCrossed, CheckSquare, BarChart2, Trash2, NotebookText, Calendar as CalendarIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// --- Simple localStorage helpers -------------------------------------------------
const safeStorage = typeof window !== "undefined" ? window.localStorage : undefined;
const lsGet = (key, fallback) => {
  try { const raw = safeStorage?.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};
const lsSet = (key, value) => { try { safeStorage?.setItem(key, JSON.stringify(value)); } catch {} };
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2,9)}`);

// --- Very small food database (per serving) -------------------------------------
const FOOD_DB = {
  "banana": { unit: "medium", calories: 105, protein: 1.3, carbs: 27, fat: 0.3 },
  "egg": { unit: "large", calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
  "chicken breast": { unit: "100 g", calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  "rice, cooked": { unit: "1 cup", calories: 206, protein: 4.3, carbs: 45, fat: 0.4 },
  "milk, 2%": { unit: "1 cup", calories: 122, protein: 8, carbs: 12, fat: 5 },
  "oats": { unit: "1/2 cup dry", calories: 154, protein: 5.3, carbs: 27, fat: 2.6 },
  "apple": { unit: "medium", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
};

// --- Types (JSDoc for DX, keep JS for portability) ------------------------------
/** @typedef {{ id: string, date: string, name: string, quantity: number, unit: string, calories: number, protein?: number, carbs?: number, fat?: number }} FoodEntry */
/** @typedef {{ id: string, name: string, createdAt: string }} Habit */
/** @typedef {{ done: boolean, note?: string }} HabitStatus */

// --- Storage keys ----------------------------------------------------------------
const LS_MEALS = "fp_meals_v1";      // FoodEntry[]
const LS_HABITS = "fp_habits_v1";    // Habit[]
const LS_HABIT_STATE = "fp_habit_state_v1"; // { [dateStr]: { [habitId]: HabitStatus } }

// --- Utility --------------------------------------------------------------------
const todayStr = () => new Date().toISOString().slice(0,10); // YYYY-MM-DD
const fmtNum = (n) => (Math.round((n || 0) * 10) / 10).toString();

// --- App ------------------------------------------------------------------------
export default function FitnessPalBaseApp() {
  const [activeTab, setActiveTab] = useState("meals");
  const [date, setDate] = useState(todayStr());

  /** @type {[FoodEntry[], Function]} */
  const [meals, setMeals] = useState(() => lsGet(LS_MEALS, []));
  /** @type {[Habit[], Function]} */
  const [habits, setHabits] = useState(() => lsGet(LS_HABITS, []));
  /** @type {[Record<string, Record<string, HabitStatus>>, Function]} */
  const [habitState, setHabitState] = useState(() => lsGet(LS_HABIT_STATE, {}));

  useEffect(() => { lsSet(LS_MEALS, meals); }, [meals]);
  useEffect(() => { lsSet(LS_HABITS, habits); }, [habits]);
  useEffect(() => { lsSet(LS_HABIT_STATE, habitState); }, [habitState]);

  // --- Derived totals for selected date ----------------------------------------
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

  // --- Weekly analytics ----------------------------------------------------------
  const weekData = useMemo(() => {
    const out = [];
    const base = new Date(date);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(base.getDate() - i);
      const ds = d.toISOString().slice(0,10);
      const kcal = meals.filter(m => m.date === ds).reduce((s, m) => s + (m.calories||0), 0);
      out.push({ day: ds.slice(5), calories: Math.round(kcal) }); // show MM-DD
    }
    return out;
  }, [meals, date]);

  // --- Meals actions -------------------------------------------------------------
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

  // --- Habits actions ------------------------------------------------------------
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <motion.div initial={{opacity:0, y:-8}} animate={{opacity:1, y:0}} className="flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6" />
            <h1 className="font-semibold text-xl">FitnessPal • Base</h1>
          </motion.div>
          <div className="ml-auto flex items-center gap-2">
            <CalendarIcon className="w-4 h-4"/>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
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
        Local-first demo. Data is saved to your browser. You can port this to a backend later (Next.js API + Prisma) without changing the UI logic.
      </footer>
    </div>
  );
}

// --- UI Bits --------------------------------------------------------------------
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
