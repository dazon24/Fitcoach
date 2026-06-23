import React, { useState, useRef } from "react";
import { Camera, Dumbbell, Activity, Sparkles, Plus, Trash2, ChevronRight, Flame, Moon, Heart, Footprints, Scale, Mic, Keyboard, Square, Image as ImageIcon, CalendarDays, TrendingUp } from "lucide-react";

// ---------- helpers ----------
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

async function callClaude(messages, { vision } = {}) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages,
    }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  return text;
}

// ---------- persistance locale ----------
const STORE_KEY = "fitcoach_data_v2";

function todayStr() {
  return new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStore(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // stockage indisponible (mode privé strict) : on ignore silencieusement
  }
}

// Calcul de la dépense énergétique totale (partagé app + archive)
function computeExpenditure(profile, bio, totalBurn) {
  if (!profile) return 0;
  const sexFactor = profile.sexe === "Homme" ? 5 : profile.sexe === "Femme" ? -161 : -78;
  const baseBMR = Math.round(
    10 * (profile.poids || 70) + 6.25 * (profile.taille || 170) - 5 * (profile.age || 30) + sexFactor
  );
  const stepsBurn = Math.round((bio?.steps || 0) * 0.04);
  const sleepFactor = (bio?.sleepHours || 7) < 6.5 ? 0.96 : 1;
  return Math.round((baseBMR + stepsBurn + totalBurn) * sleepFactor);
}

// Construit l'instantané d'une journée à archiver
function buildDaySnapshot(profile, meals, workouts, bio) {
  const intake = meals.reduce((s, m) => s + (m.kcal || 0), 0);
  const burn = workouts.reduce((s, w) => s + (w.kcal_estime || 0), 0);
  const expenditure = computeExpenditure(profile, bio, burn);
  return {
    meals,
    workouts,
    bio,
    intake,
    expenditure,
    balance: intake - expenditure,
    weight: bio?.weight ?? null,
  };
}

function parseJsonLoose(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return null;
  }
}

// ---------- design tokens ----------
// Palette: ink #15201C, paper #F6F3EC, moss #3F5C49, ember #C76B3E, signal #E8E1D2, line #D8D2C2
// Type: display "Fraunces" (characterful serif), body "Inter", mono "JetBrains Mono"-ish via system mono for numbers

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap";

function useInjectFonts() {
  React.useEffect(() => {
    if (document.getElementById("fc-fonts")) return;
    const link = document.createElement("link");
    link.id = "fc-fonts";
    link.rel = "stylesheet";
    link.href = FONT_LINK;
    document.head.appendChild(link);
  }, []);
}

const styles = {
  display: { fontFamily: "'Fraunces', serif" },
  body: { fontFamily: "'Inter', sans-serif" },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
};

// ---------- speech recognition hook ----------
function useSpeechToText() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const recRef = useRef(null);
  const finalRef = useRef("");

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setUnsupported(true);
      return;
    }
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      let interim = "";
      // On ne traite que les nouveaux résultats à partir de e.resultIndex
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finalRef.current += res[0].transcript + " ";
        } else {
          interim += res[0].transcript;
        }
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    finalRef.current = "";
    setTranscript("");
    setListening(true);
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  function reset() {
    finalRef.current = "";
    setTranscript("");
  }

  return { listening, transcript, start, stop, unsupported, setTranscript, reset };
}

// ---------- input mode selector ----------
function ModeSelector({ mode, setMode, modes }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
      {modes.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "9px 0",
              borderRadius: 9,
              border: "1px solid",
              borderColor: active ? "transparent" : "#3A453E",
              background: active ? "#E8E1D2" : "transparent",
              color: active ? "#15201C" : "#A8A493",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <m.icon size={14} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- main app ----------
export default function App() {
  useInjectFonts();
  const [tab, setTab] = useState("nutrition");

  // Chargement initial depuis le stockage local
  const stored = typeof window !== "undefined" ? loadStore() : null;
  const isNewDay = !stored || stored.day !== todayStr();

  const [profile, setProfile] = useState(stored?.profile || null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  // Historique des jours passés : { "AAAA-MM-JJ": snapshot }
  const [history, setHistory] = useState(() => {
    const h = stored?.history || {};
    // Si on change de jour ET qu'il y avait des données la veille, on archive
    if (stored && isNewDay && stored.day) {
      const hadData = (stored.meals?.length || 0) > 0 || (stored.workouts?.length || 0) > 0;
      if (hadData) {
        h[stored.day] = buildDaySnapshot(stored.profile, stored.meals || [], stored.workouts || [], stored.bio);
      }
    }
    return h;
  });

  // Jour courant : repart à vide si nouveau jour, sinon reprend l'existant
  const [meals, setMeals] = useState(isNewDay ? [] : stored?.meals || []);
  const [workouts, setWorkouts] = useState(isNewDay ? [] : stored?.workouts || []);
  const [bio, setBio] = useState(
    stored?.bio || {
      restingHR: 58,
      sleepHours: 7.2,
      steps: 8400,
      weight: 68.4,
      hrv: 52,
    }
  );

  // Sauvegarde automatique à chaque changement
  React.useEffect(() => {
    saveStore({ day: todayStr(), profile, meals, workouts, bio, history });
  }, [profile, meals, workouts, bio, history]);

  const tabs = [
    { id: "nutrition", label: "Nutrition", icon: Camera },
    { id: "training", label: "Entraînement", icon: Dumbbell },
    { id: "biometrie", label: "Biométrie", icon: Activity },
    { id: "historique", label: "Historique", icon: CalendarDays },
    { id: "coach", label: "Coach", icon: Sparkles },
  ];

  const totalIntake = meals.reduce((s, m) => s + (m.kcal || 0), 0);
  const totalBurn = workouts.reduce((s, w) => s + (w.kcal || 0), 0);

  if (!profile || showProfileEdit) {
    return (
      <ProfileSetup
        existing={profile}
        onSave={(p) => {
          setProfile(p);
          setBio((prev) => ({ ...prev, weight: p.poids || prev.weight }));
          setShowProfileEdit(false);
        }}
      />
    );
  }

  return (
    <div style={{ ...styles.body, background: "#F6F3EC", minHeight: "100vh", color: "#15201C" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 90 }}>
        <Header profile={profile} onEditProfile={() => setShowProfileEdit(true)} />
        <div style={{ padding: "0 20px" }}>
          {tab === "nutrition" && <NutritionAgent meals={meals} setMeals={setMeals} />}
          {tab === "training" && <TrainingAgent workouts={workouts} setWorkouts={setWorkouts} />}
          {tab === "biometrie" && <BiometricsAgent bio={bio} setBio={setBio} />}
          {tab === "historique" && <HistoryAgent history={history} />}
          {tab === "coach" && (
            <CoachAgent
              profile={profile}
              meals={meals}
              workouts={workouts}
              bio={bio}
              totalIntake={totalIntake}
              totalBurn={totalBurn}
            />
          )}
        </div>
      </div>
      <TabBar tabs={tabs} active={tab} setActive={setTab} />
    </div>
  );
}

// ---------- profile setup (onboarding multi-testeurs) ----------
const GOALS = ["Prise de masse", "Perte de poids", "Maintien", "Performance"];
const SEXES = ["Femme", "Homme", "Autre"];
const SPORTS = ["Course à pied", "Trail", "Musculation", "CrossFit", "Vélo", "Natation", "HIIT", "Yoga", "Football", "Rugby", "Tennis", "Escalade", "Autre"];

function ProfileSetup({ existing, onSave }) {
  useInjectFonts();
  const [form, setForm] = useState(
    existing || {
      prenom: "",
      nom: "",
      age: "",
      sexe: SEXES[0],
      taille: "",
      poids: "",
      goal: GOALS[0],
      sports: [],
      targetSurplus: 400,
    }
  );

  function toggleSport(s) {
    setForm((f) => {
      const cur = f.sports || [];
      return { ...f, sports: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] };
    });
  }

  const canSave = form.prenom.trim() && form.age && form.poids;

  const inputStyle = {
    width: "100%",
    background: "#FFFFFF",
    color: "#15201C",
    border: "1px solid #D8D2C2",
    borderRadius: 9,
    padding: "11px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 12, color: "#6B6356", marginBottom: 5, display: "block" };

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div style={{ ...styles.body, background: "#F6F3EC", minHeight: "100vh", color: "#15201C" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px 60px" }}>
        <div style={{ ...styles.mono, fontSize: 11, color: "#8A8270", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>
          {existing ? "Modifier le profil" : "Nouveau testeur"}
        </div>
        <h1 style={{ ...styles.display, fontSize: 26, fontWeight: 600, margin: "0 0 6px" }}>
          {existing ? "Mets à jour tes infos" : "Avant de commencer"}
        </h1>
        <p style={{ fontSize: 13.5, color: "#6B6356", margin: "0 0 22px", lineHeight: 1.5 }}>
          Ces informations permettent au coach de calculer des estimations adaptées à chaque personne.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Prénom</label>
            <input style={inputStyle} value={form.prenom} onChange={(e) => update("prenom", e.target.value)} placeholder="Léa" />
          </div>
          <div>
            <label style={labelStyle}>Nom</label>
            <input style={inputStyle} value={form.nom} onChange={(e) => update("nom", e.target.value)} placeholder="Martin" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Âge</label>
            <input style={inputStyle} type="number" value={form.age} onChange={(e) => update("age", e.target.value)} placeholder="29" />
          </div>
          <div>
            <label style={labelStyle}>Sexe</label>
            <select style={inputStyle} value={form.sexe} onChange={(e) => update("sexe", e.target.value)}>
              {SEXES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Taille (cm)</label>
            <input style={inputStyle} type="number" value={form.taille} onChange={(e) => update("taille", e.target.value)} placeholder="168" />
          </div>
          <div>
            <label style={labelStyle}>Poids (kg)</label>
            <input style={inputStyle} type="number" value={form.poids} onChange={(e) => update("poids", e.target.value)} placeholder="68" />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Objectif</label>
          <select style={inputStyle} value={form.goal} onChange={(e) => update("goal", e.target.value)}>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Sports pratiqués (un ou plusieurs)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
            {SPORTS.map((s) => {
              const active = (form.sports || []).includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSport(s)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 20,
                    border: "1px solid",
                    borderColor: active ? "#3F5C49" : "#D8D2C2",
                    background: active ? "#3F5C49" : "transparent",
                    color: active ? "#F6F3EC" : "#6B6356",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {(form.sports || []).includes("Autre") && (
            <input
              value={form.autreSport || ""}
              onChange={(e) => update("autreSport", e.target.value)}
              placeholder="Précise ton/tes autre(s) sport(s)"
              style={{ ...inputStyle, marginTop: 10 }}
            />
          )}
        </div>

        <button
          onClick={() => canSave && onSave({ ...form, age: parseFloat(form.age), taille: parseFloat(form.taille), poids: parseFloat(form.poids) })}
          disabled={!canSave}
          style={{
            width: "100%",
            marginTop: 8,
            background: canSave ? "#15201C" : "#D8D2C2",
            color: "#F6F3EC",
            border: "none",
            borderRadius: 10,
            padding: "13px 0",
            fontWeight: 600,
            fontSize: 14.5,
            cursor: canSave ? "pointer" : "default",
          }}
        >
          {existing ? "Enregistrer" : "Commencer"}
        </button>

        {existing && (
          <button
            onClick={() => {
              if (confirm("Effacer toutes les données (profil, repas, séances) et recommencer à zéro ?")) {
                try {
                  localStorage.removeItem(STORE_KEY);
                } catch {}
                window.location.reload();
              }
            }}
            style={{
              width: "100%",
              marginTop: 12,
              background: "transparent",
              color: "#A8453A",
              border: "1px solid #E0CFC9",
              borderRadius: 10,
              padding: "11px 0",
              fontWeight: 500,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            Réinitialiser toutes mes données
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- header ----------
function Header({ profile, onEditProfile }) {
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div style={{ padding: "28px 20px 18px", borderBottom: "1px solid #D8D2C2" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, color: "#6B6356", textTransform: "capitalize", letterSpacing: 0.3 }}>{today}</div>
          <h1 style={{ ...styles.display, fontSize: 28, fontWeight: 600, margin: "4px 0 0" }}>
            Salut, {profile.prenom}
          </h1>
        </div>
        <button
          onClick={onEditProfile}
          style={{
            ...styles.mono,
            fontSize: 11,
            background: "#3F5C49",
            color: "#F6F3EC",
            padding: "5px 10px",
            borderRadius: 20,
            border: "none",
            cursor: "pointer",
            marginTop: 3,
          }}
        >
          {profile.goal}
        </button>
      </div>
    </div>
  );
}

// ---------- tab bar ----------
function TabBar({ tabs, active, setActive }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#15201C",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", width: "100%", maxWidth: 480 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                padding: "13px 2px 15px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                color: isActive ? "#E8E1D2" : "#6B7A70",
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
              <span style={{ fontSize: 9.5, letterSpacing: 0.1, textAlign: "center", lineHeight: 1.1 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- card shell ----------
function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4DECF",
        borderRadius: 14,
        padding: 18,
        marginTop: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ ...styles.mono, fontSize: 11, color: "#8A8270", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </div>
  );
}

// ---------- NUTRITION AGENT ----------
function NutritionAgent({ meals, setMeals }) {
  const [mode, setMode] = useState("photo");
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingBase64, setPendingBase64] = useState(null);
  const [pendingMime, setPendingMime] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const inputRef = useRef(null);

  // audio
  const speech = useSpeechToText();

  // manual
  const [manual, setManual] = useState({ name: "", kcal: "", proteines: "", glucides: "", lipides: "" });

  const NUTRITION_MODES = [
    { id: "photo", label: "Photo", icon: Camera },
    { id: "audio", label: "Audio", icon: Mic },
    { id: "manuel", label: "Manuel", icon: Keyboard },
  ];

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDraft(null);
    setShowCorrection(false);
    setCorrectionNote("");
    setAnalyzing(true);
    try {
      const base64 = await fileToBase64(file);
      setPendingImage(`data:${file.type};base64,${base64}`);
      setPendingBase64(base64);
      setPendingMime(file.type);

      const prompt = `Tu es un agent de reconnaissance alimentaire. Analyse cette photo de repas et réponds UNIQUEMENT en JSON, sans aucun texte autour, avec ce format exact:
{
  "items": [{"name": "string", "portion_estimee": "string", "kcal": number, "proteines_g": number, "glucides_g": number, "lipides_g": number}],
  "kcal_total": number,
  "confiance": "haute" | "moyenne" | "basse",
  "question_pour_utilisateur": "string ou null si aucune ambiguïté"
}
Sois réaliste sur les portions à partir de repères visuels (taille d'assiette, couverts). Si l'image n'est pas un repas, retourne items vide et confiance basse.`;

      const text = await callClaude([
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
            { type: "text", text: prompt },
          ],
        },
      ]);
      const parsed = parseJsonLoose(text);
      if (!parsed) throw new Error("parse_failed");
      setDraft(parsed);
    } catch (err) {
      setError("L'analyse a échoué. Réessaie avec une autre photo, ou utilise le mode audio ou manuel.");
    } finally {
      setAnalyzing(false);
    }
  }

  // Réanalyse de la photo en tenant compte de la correction de l'utilisateur
  async function reanalyzeWithCorrection() {
    if (!pendingBase64 || !correctionNote.trim()) return;
    setError(null);
    setAnalyzing(true);
    setShowCorrection(false);
    try {
      const prompt = `Tu es un agent de reconnaissance alimentaire. Tu avais proposé cette analyse de la photo:
${JSON.stringify(draft)}

L'utilisateur indique que c'est en partie faux et précise: "${correctionNote}"

Refais l'analyse en tenant compte de cette correction (elle est prioritaire sur ce que tu crois voir). Réponds UNIQUEMENT en JSON, même format:
{
  "items": [{"name": "string", "portion_estimee": "string", "kcal": number, "proteines_g": number, "glucides_g": number, "lipides_g": number}],
  "kcal_total": number,
  "confiance": "haute" | "moyenne" | "basse",
  "question_pour_utilisateur": null
}`;
      const text = await callClaude([
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: pendingMime, data: pendingBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ]);
      const parsed = parseJsonLoose(text);
      if (!parsed) throw new Error("parse_failed");
      setDraft(parsed);
      setCorrectionNote("");
    } catch {
      setError("La réanalyse a échoué. Tu peux confirmer l'estimation actuelle ou réessayer.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeAudioTranscript(transcript) {
    if (!transcript.trim()) return;
    setError(null);
    setAnalyzing(true);
    try {
      const prompt = `Tu es un agent de reconnaissance alimentaire. Voici la description orale d'un repas, retranscrite en texte: "${transcript}"
Réponds UNIQUEMENT en JSON avec ce format exact:
{
  "items": [{"name": "string", "portion_estimee": "string", "kcal": number, "proteines_g": number, "glucides_g": number, "lipides_g": number}],
  "kcal_total": number,
  "confiance": "haute" | "moyenne" | "basse",
  "question_pour_utilisateur": "string ou null si aucune ambiguïté"
}
Estime les portions de façon réaliste même si elles ne sont pas précisées (ex: "une assiette de pâtes" = portion standard ~350g cuites).`;
      const text = await callClaude([{ role: "user", content: prompt }]);
      const parsed = parseJsonLoose(text);
      if (!parsed) throw new Error("parse_failed");
      setDraft(parsed);
      setPendingImage(null);
    } catch {
      setError("Impossible d'interpréter la description. Réessaie ou passe en mode manuel.");
    } finally {
      setAnalyzing(false);
    }
  }

  function confirmMeal() {
    if (!draft) return;
    setMeals((prev) => [
      ...prev,
      {
        id: Date.now(),
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        items: draft.items,
        kcal: draft.kcal_total,
        image: pendingImage,
      },
    ]);
    setDraft(null);
    setPendingImage(null);
    speech.setTranscript("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function addManualMeal() {
    const kcal = parseFloat(manual.kcal) || 0;
    if (!manual.name.trim() || !kcal) return;
    setMeals((prev) => [
      ...prev,
      {
        id: Date.now(),
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        items: [
          {
            name: manual.name,
            portion_estimee: "saisie manuelle",
            kcal,
            proteines_g: parseFloat(manual.proteines) || 0,
            glucides_g: parseFloat(manual.glucides) || 0,
            lipides_g: parseFloat(manual.lipides) || 0,
          },
        ],
        kcal,
        image: null,
      },
    ]);
    setManual({ name: "", kcal: "", proteines: "", glucides: "", lipides: "" });
  }

  return (
    <div>
      <Card style={{ background: "#15201C", color: "#F6F3EC", border: "none" }}>
        <SectionLabelDark>Agent Nutrition</SectionLabelDark>
        <p style={{ ...styles.display, fontSize: 19, margin: "2px 0 14px", lineHeight: 1.3 }}>
          Photo, voix ou saisie — choisis ce qui va le plus vite.
        </p>

        <ModeSelector mode={mode} setMode={setMode} modes={NUTRITION_MODES} />

        {mode === "photo" && (
          <>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} id="meal-camera" />
            <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} id="meal-gallery" />
            <div style={{ display: "flex", gap: 8 }}>
              <label
                htmlFor="meal-camera"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#E8E1D2", color: "#15201C", borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
              >
                <Camera size={16} /> Photo
              </label>
              <label
                htmlFor="meal-gallery"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "transparent", color: "#E8E1D2", border: "1px solid #3A453E", borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
              >
                <ImageIcon size={16} /> Galerie
              </label>
            </div>
          </>
        )}

        {mode === "audio" && (
          <AudioCapture
            speech={speech}
            onSubmit={analyzeAudioTranscript}
            placeholder="Ex: « j'ai mangé une assiette de pâtes au saumon avec un peu de parmesan »"
          />
        )}

        {mode === "manuel" && (
          <ManualMealForm manual={manual} setManual={setManual} onSubmit={addManualMeal} onAnalyzeText={analyzeAudioTranscript} />
        )}
      </Card>

      {analyzing && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#6B6356" }}>
            <Spinner /> {mode === "audio" ? "Interprétation de la description en cours…" : "Reconnaissance des aliments en cours…"}
          </div>
        </Card>
      )}

      {error && (
        <Card style={{ borderColor: "#C76B3E" }}>
          <div style={{ color: "#C76B3E", fontSize: 14 }}>{error}</div>
        </Card>
      )}

      {draft && (
        <Card>
          <SectionLabel>Résultat de l'analyse</SectionLabel>
          {pendingImage && (
            <img src={pendingImage} alt="repas" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 10, marginBottom: 12 }} />
          )}
          {draft.items?.length === 0 ? (
            <p style={{ fontSize: 14, color: "#6B6356" }}>Aucun aliment détecté avec assez de confiance.</p>
          ) : (
            <>
              {draft.items.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < draft.items.length - 1 ? "1px solid #EFEAE0" : "none" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{it.name}</div>
                    <div style={{ fontSize: 12, color: "#8A8270" }}>{it.portion_estimee}</div>
                  </div>
                  <div style={{ ...styles.mono, fontSize: 14 }}>{it.kcal} kcal</div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #D8D2C2" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Total estimé</span>
                <span style={{ ...styles.mono, fontWeight: 600, fontSize: 16 }}>{draft.kcal_total} kcal</span>
              </div>
              <ConfidenceBadge level={draft.confiance} />
              {draft.question_pour_utilisateur && (
                <div style={{ marginTop: 12, fontSize: 13, background: "#F6F3EC", padding: 10, borderRadius: 8, color: "#3F5C49" }}>
                  L'agent demande : {draft.question_pour_utilisateur}
                </div>
              )}
              <button
                onClick={confirmMeal}
                style={{
                  marginTop: 14,
                  width: "100%",
                  background: "#3F5C49",
                  color: "#F6F3EC",
                  border: "none",
                  borderRadius: 9,
                  padding: "11px 0",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Confirmer ce repas
              </button>

              {pendingBase64 && !showCorrection && (
                <button
                  onClick={() => setShowCorrection(true)}
                  style={{
                    marginTop: 9,
                    width: "100%",
                    background: "transparent",
                    color: "#C76B3E",
                    border: "1px solid #E0CFC9",
                    borderRadius: 9,
                    padding: "10px 0",
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  L'analyse est fausse ? Corriger
                </button>
              )}

              {showCorrection && (
                <div style={{ marginTop: 12, background: "#F6F3EC", padding: 12, borderRadius: 10 }}>
                  <div style={{ fontSize: 12.5, color: "#6B6356", marginBottom: 8, lineHeight: 1.45 }}>
                    Explique ce qui est faux (l'aliment, la quantité…). L'agent réanalysera la photo en tenant compte de ta correction.
                  </div>
                  <textarea
                    value={correctionNote}
                    onChange={(e) => setCorrectionNote(e.target.value)}
                    placeholder="Ex: ce n'est pas du riz mais du quinoa, et il y a environ 200g de poulet"
                    rows={3}
                    style={{
                      width: "100%",
                      border: "1px solid #D8D2C2",
                      borderRadius: 9,
                      padding: 10,
                      fontSize: 13.5,
                      fontFamily: "inherit",
                      resize: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => { setShowCorrection(false); setCorrectionNote(""); }}
                      style={{ flex: 1, background: "transparent", color: "#6B6356", border: "1px solid #D8D2C2", borderRadius: 8, padding: "9px 0", fontSize: 13, cursor: "pointer" }}
                    >
                      Annuler
                    </button>
                    <button
                      onClick={reanalyzeWithCorrection}
                      disabled={!correctionNote.trim()}
                      style={{ flex: 1, background: "#3F5C49", color: "#F6F3EC", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: correctionNote.trim() ? "pointer" : "default", opacity: correctionNote.trim() ? 1 : 0.5 }}
                    >
                      Réanalyser
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {meals.length > 0 && (
        <Card>
          <SectionLabel>Repas du jour ({meals.length})</SectionLabel>
          {meals.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #EFEAE0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {m.image && <img src={m.image} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />}
                <div>
                  <div style={{ fontSize: 13 }}>{m.items.map((i) => i.name).join(", ")}</div>
                  <div style={{ fontSize: 11, color: "#8A8270" }}>{m.time}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...styles.mono, fontSize: 13 }}>{m.kcal} kcal</span>
                <button onClick={() => setMeals((prev) => prev.filter((x) => x.id !== m.id))} style={{ border: "none", background: "none", cursor: "pointer", color: "#C76B3E" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- shared: audio capture ----------
function AudioCapture({ speech, onSubmit, placeholder }) {
  if (speech.unsupported) {
    return (
      <div style={{ fontSize: 13, color: "#A8A493", lineHeight: 1.5 }}>
        La reconnaissance vocale n'est pas disponible sur ce navigateur. Utilise le mode manuel ou photo à la place.
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={speech.listening ? speech.stop : speech.start}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: speech.listening ? "#A8453A" : "#E8E1D2",
          color: speech.listening ? "#F6F3EC" : "#15201C",
          border: "none",
          borderRadius: 10,
          padding: "12px 0",
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        {speech.listening ? <Square size={15} /> : <Mic size={17} />}
        {speech.listening ? "Arrêter l'enregistrement" : "Parler de ton repas"}
      </button>

      <div
        style={{
          marginTop: 10,
          minHeight: 50,
          background: "#1F2A24",
          border: "1px solid #3A453E",
          borderRadius: 10,
          padding: 12,
          fontSize: 13.5,
          color: speech.transcript ? "#F6F3EC" : "#6B7A70",
        }}
      >
        {speech.transcript || placeholder}
      </div>

      {speech.transcript && !speech.listening && (
        <button
          onClick={() => onSubmit(speech.transcript)}
          style={{
            marginTop: 10,
            width: "100%",
            background: "#3F5C49",
            color: "#F6F3EC",
            border: "none",
            borderRadius: 9,
            padding: "11px 0",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Analyser cette description
        </button>
      )}
    </div>
  );
}

// ---------- nutrition: manual form ----------
function ManualMealForm({ manual, setManual, onSubmit, onAnalyzeText }) {
  const [sub, setSub] = useState("decrire"); // "decrire" = IA calcule, "chiffres" = saisie directe
  const [desc, setDesc] = useState("");

  const inputStyle = {
    width: "100%",
    background: "#1F2A24",
    color: "#F6F3EC",
    border: "1px solid #3A453E",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
    marginBottom: 8,
  };

  return (
    <div>
      {/* Sélecteur de sous-mode */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button
          onClick={() => setSub("decrire")}
          style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid", borderColor: sub === "decrire" ? "transparent" : "#3A453E", background: sub === "decrire" ? "#E8E1D2" : "transparent", color: sub === "decrire" ? "#15201C" : "#A8A493", fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}
        >
          Décrire (calcul auto)
        </button>
        <button
          onClick={() => setSub("chiffres")}
          style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid", borderColor: sub === "chiffres" ? "transparent" : "#3A453E", background: sub === "chiffres" ? "#E8E1D2" : "transparent", color: sub === "chiffres" ? "#15201C" : "#A8A493", fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}
        >
          Saisir les chiffres
        </button>
      </div>

      {sub === "decrire" ? (
        <>
          <div style={{ fontSize: 12, color: "#A8A493", marginBottom: 8, lineHeight: 1.45 }}>
            Liste ce que tu as mangé avec les quantités. L'agent calcule les calories et macros pour toi.
          </div>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Ex: 200g de riz basmati, 150g de blanc de poulet, une cuillère d'huile d'olive"
            rows={4}
            style={{ ...inputStyle, resize: "none" }}
          />
          <button
            onClick={() => { if (desc.trim()) { onAnalyzeText(desc); setDesc(""); } }}
            disabled={!desc.trim()}
            style={{ width: "100%", background: "#E8E1D2", color: "#15201C", border: "none", borderRadius: 9, padding: "11px 0", fontWeight: 600, fontSize: 14, cursor: desc.trim() ? "pointer" : "default", opacity: desc.trim() ? 1 : 0.5 }}
          >
            Calculer les nutriments
          </button>
        </>
      ) : (
        <>
          <input
            placeholder="Nom du repas (ex: poulet riz brocolis)"
            value={manual.name}
            onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
            style={inputStyle}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Kcal" type="number" value={manual.kcal} onChange={(e) => setManual((m) => ({ ...m, kcal: e.target.value }))} style={{ ...inputStyle, marginBottom: 0 }} />
            <input placeholder="Protéines (g)" type="number" value={manual.proteines} onChange={(e) => setManual((m) => ({ ...m, proteines: e.target.value }))} style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <input placeholder="Glucides (g)" type="number" value={manual.glucides} onChange={(e) => setManual((m) => ({ ...m, glucides: e.target.value }))} style={{ ...inputStyle, marginBottom: 0 }} />
            <input placeholder="Lipides (g)" type="number" value={manual.lipides} onChange={(e) => setManual((m) => ({ ...m, lipides: e.target.value }))} style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
          <button
            onClick={onSubmit}
            style={{ width: "100%", background: "#E8E1D2", color: "#15201C", border: "none", borderRadius: 9, padding: "11px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Ajouter le repas
          </button>
        </>
      )}
    </div>
  );
}

function SectionLabelDark({ children }) {
  return (
    <div style={{ ...styles.mono, fontSize: 11, color: "#A8A493", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function ConfidenceBadge({ level }) {
  const map = {
    haute: { bg: "#3F5C49", label: "Confiance haute" },
    moyenne: { bg: "#C76B3E", label: "Confiance moyenne — vérifie les portions" },
    basse: { bg: "#A8453A", label: "Confiance basse — corrige si besoin" },
  };
  const v = map[level] || map.moyenne;
  return (
    <div style={{ marginTop: 10, display: "inline-block", ...styles.mono, fontSize: 11, color: "#fff", background: v.bg, padding: "4px 9px", borderRadius: 20 }}>
      {v.label}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: "2px solid #D8D2C2",
        borderTopColor: "#3F5C49",
        animation: "fc-spin 0.8s linear infinite",
      }}
    >
      <style>{`@keyframes fc-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------- TRAINING AGENT ----------
const ACTIVITIES = ["Course à pied", "Musculation", "Vélo", "Natation", "HIIT", "Yoga", "Marche", "Autre"];
const INTENSITES = ["faible", "modérée", "élevée"];

function TrainingAgent({ workouts, setWorkouts }) {
  const [mode, setMode] = useState("audio");
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const speech = useSpeechToText();
  const photoInputRef = useRef(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingBase64, setPendingBase64] = useState(null);
  const [pendingMime, setPendingMime] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");

  const [manual, setManual] = useState({ type: ACTIVITIES[0], duree: "", intensite: "modérée", kcal: "" });

  const TRAINING_MODES = [
    { id: "texte", label: "Texte", icon: Keyboard },
    { id: "audio", label: "Audio", icon: Mic },
    { id: "photo", label: "Photo", icon: Camera },
    { id: "manuel", label: "Manuel", icon: Plus },
  ];

  async function analyzeText(description) {
    if (!description.trim()) return;
    setAnalyzing(true);
    setError(null);
    setShowCorrection(false);
    setCorrectionNote("");
    try {
      const prompt = `Tu es un agent d'estimation de dépense énergétique à l'entraînement. À partir de cette description en langage libre d'une séance, réponds UNIQUEMENT en JSON:
{
  "type": "string",
  "duree_min": number,
  "intensite": "faible" | "modérée" | "élevée",
  "kcal_estime": number,
  "resume": "string courte phrase"
}
Description de la séance: "${description}"
Base-toi sur une personne de profil moyen actif (~70kg) si aucune donnée n'est fournie. Sois réaliste, pas optimiste.`;
      const out = await callClaude([{ role: "user", content: prompt }]);
      const parsed = parseJsonLoose(out);
      if (!parsed) throw new Error("parse_failed");
      setDraft(parsed);
      setPendingImage(null);
      setPendingBase64(null);
      setText("");
      speech.setTranscript("");
    } catch {
      setError("Impossible d'analyser cette séance. Reformule, ou utilise le mode manuel.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setShowCorrection(false);
    setCorrectionNote("");
    setAnalyzing(true);
    try {
      const base64 = await fileToBase64(file);
      setPendingImage(`data:${file.type};base64,${base64}`);
      setPendingBase64(base64);
      setPendingMime(file.type);

      const prompt = `Tu es un agent d'estimation de dépense énergétique à l'entraînement. L'image montre soit un tableau de séance écrit (ex: salle de CrossFit/musculation), soit l'écran d'une machine de cardio (rameur, vélo, tapis, etc). Lis les informations visibles (type d'effort, durée, distance, calories affichées, séries, répétitions, watts...) et réponds UNIQUEMENT en JSON:
{
  "type": "string",
  "duree_min": number,
  "intensite": "faible" | "modérée" | "élevée",
  "kcal_estime": number,
  "resume": "string décrivant ce qui a été lu sur l'image"
}
Si la machine affiche directement des calories, utilise cette valeur en priorité plutôt que d'estimer. Si l'image est illisible ou ne correspond à aucune séance, mets kcal_estime à 0 et explique dans resume.`;

      const out = await callClaude([
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
            { type: "text", text: prompt },
          ],
        },
      ]);
      const parsed = parseJsonLoose(out);
      if (!parsed) throw new Error("parse_failed");
      if (!parsed.kcal_estime) {
        setError(parsed.resume || "Impossible de lire les données sur cette image. Essaie une photo plus nette ou un autre mode.");
      } else {
        setDraft(parsed);
      }
    } catch {
      setError("L'analyse de l'image a échoué. Réessaie ou utilise un autre mode.");
    } finally {
      setAnalyzing(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  // Confirme le brouillon : ajoute la séance à la liste
  function confirmWorkout() {
    if (!draft) return;
    setWorkouts((prev) => [...prev, { id: Date.now(), ...draft }]);
    setDraft(null);
    setPendingImage(null);
    setPendingBase64(null);
  }

  // Réanalyse en tenant compte de la correction de l'utilisateur
  async function reanalyzeWorkout() {
    if (!correctionNote.trim() || !draft) return;
    setError(null);
    setAnalyzing(true);
    setShowCorrection(false);
    try {
      const content = [];
      if (pendingBase64) {
        content.push({ type: "image", source: { type: "base64", media_type: pendingMime, data: pendingBase64 } });
      }
      content.push({
        type: "text",
        text: `Tu es un agent d'estimation de dépense à l'entraînement. Tu avais proposé:
${JSON.stringify(draft)}

L'utilisateur corrige: "${correctionNote}"

Refais l'estimation en tenant compte de cette correction (prioritaire). Réponds UNIQUEMENT en JSON, même format:
{
  "type": "string",
  "duree_min": number,
  "intensite": "faible" | "modérée" | "élevée",
  "kcal_estime": number,
  "resume": "string"
}`,
      });
      const out = await callClaude([{ role: "user", content }]);
      const parsed = parseJsonLoose(out);
      if (!parsed) throw new Error("parse_failed");
      setDraft(parsed);
      setCorrectionNote("");
    } catch {
      setError("La réanalyse a échoué. Tu peux confirmer l'estimation actuelle ou réessayer.");
    } finally {
      setAnalyzing(false);
    }
  }

  function addManualWorkout() {
    const duree = parseFloat(manual.duree) || 0;
    const kcal = parseFloat(manual.kcal) || 0;
    if (!duree || !kcal) return;
    setWorkouts((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: manual.type,
        duree_min: duree,
        intensite: manual.intensite,
        kcal_estime: kcal,
      },
    ]);
    setManual({ type: ACTIVITIES[0], duree: "", intensite: "modérée", kcal: "" });
  }

  return (
    <div>
      <Card style={{ background: "#15201C", color: "#F6F3EC", border: "none" }}>
        <SectionLabelDark>Agent Entraînement</SectionLabelDark>
        <p style={{ ...styles.display, fontSize: 19, margin: "2px 0 14px", lineHeight: 1.3 }}>
          Raconte ta séance, parle-la, prends-la en photo, ou saisis-la.
        </p>

        <ModeSelector mode={mode} setMode={setMode} modes={TRAINING_MODES} />

        {mode === "texte" && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex: 45 min de course à allure modérée, un peu de dénivelé"
              rows={3}
              style={{
                width: "100%",
                background: "#1F2A24",
                color: "#F6F3EC",
                border: "1px solid #3A453E",
                borderRadius: 10,
                padding: 12,
                fontSize: 14,
                fontFamily: "inherit",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={() => analyzeText(text)}
              disabled={analyzing || !text.trim()}
              style={{
                marginTop: 10,
                width: "100%",
                background: "#E8E1D2",
                color: "#15201C",
                border: "none",
                borderRadius: 9,
                padding: "11px 0",
                fontWeight: 600,
                fontSize: 14,
                cursor: analyzing ? "default" : "pointer",
                opacity: analyzing ? 0.6 : 1,
              }}
            >
              {analyzing ? "Estimation en cours…" : "Estimer la dépense"}
            </button>
          </>
        )}

        {mode === "audio" && (
          <AudioCapture
            speech={speech}
            onSubmit={analyzeText}
            placeholder="Ex: « j'ai fait 45 minutes de course, allure modérée, un peu de dénivelé »"
          />
        )}

        {mode === "photo" && (
          <>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} id="workout-camera" />
            <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} id="workout-gallery" />
            <div style={{ display: "flex", gap: 8 }}>
              <label
                htmlFor="workout-camera"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#E8E1D2", color: "#15201C", borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
              >
                <Camera size={16} /> Photo
              </label>
              <label
                htmlFor="workout-gallery"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "transparent", color: "#E8E1D2", border: "1px solid #3A453E", borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
              >
                <ImageIcon size={16} /> Galerie
              </label>
            </div>
            <p style={{ fontSize: 11.5, color: "#A8A493", marginTop: 8, marginBottom: 0, lineHeight: 1.4 }}>
              Tableau de séance affiché en salle, écran de rameur, vélo ou tapis.
            </p>
          </>
        )}

        {mode === "manuel" && (
          <ManualWorkoutForm manual={manual} setManual={setManual} onSubmit={addManualWorkout} />
        )}
      </Card>

      {pendingImage && analyzing && (
        <Card>
          <img src={pendingImage} alt="séance" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 10 }} />
        </Card>
      )}

      {analyzing && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#6B6356" }}>
            <Spinner /> {mode === "photo" ? "Lecture de l'image en cours…" : "Estimation de la dépense en cours…"}
          </div>
        </Card>
      )}

      {error && (
        <Card style={{ borderColor: "#C76B3E" }}>
          <div style={{ color: "#C76B3E", fontSize: 14 }}>{error}</div>
        </Card>
      )}

      {draft && !analyzing && (
        <Card>
          <SectionLabel>Résultat de l'analyse</SectionLabel>
          {pendingImage && (
            <img src={pendingImage} alt="séance" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 10, marginBottom: 12 }} />
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{draft.type}</span>
            <span style={{ ...styles.mono, fontSize: 16, fontWeight: 600 }}>{draft.kcal_estime} kcal</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#8A8270", marginTop: 3 }}>
            {draft.duree_min} min · intensité {draft.intensite}
          </div>
          {draft.resume && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: "#6B6356", lineHeight: 1.4 }}>{draft.resume}</div>
          )}

          <button
            onClick={confirmWorkout}
            style={{ marginTop: 14, width: "100%", background: "#3F5C49", color: "#F6F3EC", border: "none", borderRadius: 9, padding: "11px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Confirmer la séance
          </button>

          {!showCorrection && (
            <button
              onClick={() => setShowCorrection(true)}
              style={{ marginTop: 9, width: "100%", background: "transparent", color: "#C76B3E", border: "1px solid #E0CFC9", borderRadius: 9, padding: "10px 0", fontWeight: 500, fontSize: 13, cursor: "pointer" }}
            >
              L'analyse est fausse ? Corriger
            </button>
          )}

          {showCorrection && (
            <div style={{ marginTop: 12, background: "#F6F3EC", padding: 12, borderRadius: 10 }}>
              <div style={{ fontSize: 12.5, color: "#6B6356", marginBottom: 8, lineHeight: 1.45 }}>
                Explique ce qui est faux (durée, intensité, type…). L'agent réestimera en tenant compte de ta correction.
              </div>
              <textarea
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                placeholder="Ex: c'était plutôt 1h, et l'intensité était élevée"
                rows={3}
                style={{ width: "100%", border: "1px solid #D8D2C2", borderRadius: 9, padding: 10, fontSize: 13.5, fontFamily: "inherit", resize: "none", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setShowCorrection(false); setCorrectionNote(""); }}
                  style={{ flex: 1, background: "transparent", color: "#6B6356", border: "1px solid #D8D2C2", borderRadius: 8, padding: "9px 0", fontSize: 13, cursor: "pointer" }}
                >
                  Annuler
                </button>
                <button
                  onClick={reanalyzeWorkout}
                  disabled={!correctionNote.trim()}
                  style={{ flex: 1, background: "#3F5C49", color: "#F6F3EC", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: correctionNote.trim() ? "pointer" : "default", opacity: correctionNote.trim() ? 1 : 0.5 }}
                >
                  Réanalyser
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {workouts.length > 0 && (
        <Card>
          <SectionLabel>Séances du jour ({workouts.length})</SectionLabel>
          {workouts.map((w) => (
            <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #EFEAE0" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{w.type}</div>
                <div style={{ fontSize: 11, color: "#8A8270" }}>
                  {w.duree_min} min · intensité {w.intensite}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...styles.mono, fontSize: 13 }}>{w.kcal_estime} kcal</span>
                <button onClick={() => setWorkouts((prev) => prev.filter((x) => x.id !== w.id))} style={{ border: "none", background: "none", cursor: "pointer", color: "#C76B3E" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- training: manual form ----------
function ManualWorkoutForm({ manual, setManual, onSubmit }) {
  const inputStyle = {
    width: "100%",
    background: "#1F2A24",
    color: "#F6F3EC",
    border: "1px solid #3A453E",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
  return (
    <div>
      <select
        value={manual.type}
        onChange={(e) => setManual((m) => ({ ...m, type: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 8 }}
      >
        {ACTIVITIES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <input
          placeholder="Durée (min)"
          type="number"
          value={manual.duree}
          onChange={(e) => setManual((m) => ({ ...m, duree: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Kcal estimées"
          type="number"
          value={manual.kcal}
          onChange={(e) => setManual((m) => ({ ...m, kcal: e.target.value }))}
          style={inputStyle}
        />
      </div>
      <select
        value={manual.intensite}
        onChange={(e) => setManual((m) => ({ ...m, intensite: e.target.value }))}
        style={{ ...inputStyle, marginBottom: 10 }}
      >
        {INTENSITES.map((i) => (
          <option key={i} value={i}>
            Intensité {i}
          </option>
        ))}
      </select>
      <button
        onClick={onSubmit}
        style={{
          width: "100%",
          background: "#E8E1D2",
          color: "#15201C",
          border: "none",
          borderRadius: 9,
          padding: "11px 0",
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Ajouter la séance
      </button>
    </div>
  );
}

// ---------- BIOMETRICS AGENT ----------
function BiometricsAgent({ bio, setBio }) {
  const fields = [
    { key: "restingHR", label: "FC repos", unit: "bpm", icon: Heart, step: 1 },
    { key: "hrv", label: "VFC", unit: "ms", icon: Activity, step: 1 },
    { key: "sleepHours", label: "Sommeil", unit: "h", icon: Moon, step: 0.1 },
    { key: "steps", label: "Pas", unit: "", icon: Footprints, step: 100 },
    { key: "weight", label: "Poids", unit: "kg", icon: Scale, step: 0.1 },
  ];

  function update(key, value) {
    setBio((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <Card style={{ background: "#15201C", color: "#F6F3EC", border: "none" }}>
        <SectionLabelDark>Agent Biométrie</SectionLabelDark>
        <p style={{ ...styles.display, fontSize: 19, margin: "2px 0 6px", lineHeight: 1.3 }}>
          Simule une synchronisation montre.
        </p>
        <p style={{ fontSize: 12.5, color: "#A8A493", margin: 0 }}>
          Dans la version finale, ces valeurs viendraient d'Apple Health, Garmin ou Whoop. Ici, ajuste-les pour voir comment elles influencent le coach.
        </p>
      </Card>

      <Card>
        {fields.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={f.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 0",
                borderBottom: i < fields.length - 1 ? "1px solid #EFEAE0" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#F6F3EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={15} color="#3F5C49" />
                </div>
                <span style={{ fontSize: 14 }}>{f.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  value={bio[f.key]}
                  step={f.step}
                  onChange={(e) => update(f.key, parseFloat(e.target.value) || 0)}
                  style={{
                    width: 70,
                    ...styles.mono,
                    fontSize: 14,
                    textAlign: "right",
                    border: "1px solid #D8D2C2",
                    borderRadius: 7,
                    padding: "6px 8px",
                  }}
                />
                <span style={{ fontSize: 12, color: "#8A8270", width: 24 }}>{f.unit}</span>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ---------- HISTORY AGENT ----------
function HistoryAgent({ history }) {
  // Trie les jours du plus récent au plus ancien
  const days = Object.keys(history || {}).sort((a, b) => b.localeCompare(a));

  if (days.length === 0) {
    return (
      <div>
        <Card style={{ background: "#15201C", color: "#F6F3EC", border: "none" }}>
          <SectionLabelDark>Agent Historique</SectionLabelDark>
          <p style={{ ...styles.display, fontSize: 19, margin: "2px 0 6px", lineHeight: 1.3 }}>
            Pas encore d'historique.
          </p>
          <p style={{ fontSize: 12.5, color: "#A8A493", margin: 0, lineHeight: 1.5 }}>
            Tes journées s'archivent automatiquement ici à partir de demain. Continue à enregistrer tes repas et séances aujourd'hui.
          </p>
        </Card>
      </div>
    );
  }

  // Données pour les graphiques (ordre chronologique croissant)
  const chrono = [...days].reverse();
  const labels = chrono.map((d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  });
  const intakeSeries = chrono.map((d) => history[d].intake || 0);
  const expenditureSeries = chrono.map((d) => history[d].expenditure || 0);
  const weightSeries = chrono.map((d) => history[d].weight || null);
  const hasWeight = weightSeries.some((w) => w != null);

  return (
    <div>
      <Card style={{ background: "#15201C", color: "#F6F3EC", border: "none" }}>
        <SectionLabelDark>Agent Historique</SectionLabelDark>
        <p style={{ ...styles.display, fontSize: 19, margin: "2px 0 6px", lineHeight: 1.3 }}>
          {days.length} jour{days.length > 1 ? "s" : ""} enregistré{days.length > 1 ? "s" : ""}.
        </p>
        <p style={{ fontSize: 12.5, color: "#A8A493", margin: 0, lineHeight: 1.5 }}>
          Tes tendances sur la durée. Les données restent sur cet appareil.
        </p>
      </Card>

      {/* Graphique apport vs dépense */}
      <Card>
        <SectionLabel>Apport vs dépense (kcal)</SectionLabel>
        <MiniBars labels={labels} seriesA={intakeSeries} seriesB={expenditureSeries} colorA="#3F5C49" colorB="#C76B3E" legendA="Apport" legendB="Dépense" />
      </Card>

      {/* Graphique poids */}
      {hasWeight && (
        <Card>
          <SectionLabel>Évolution du poids (kg)</SectionLabel>
          <MiniLine labels={labels} values={weightSeries} color="#3F5C49" />
        </Card>
      )}

      {/* Liste détaillée des jours */}
      <Card>
        <SectionLabel>Journal</SectionLabel>
        {days.map((d) => {
          const snap = history[d];
          const dt = new Date(d);
          const dateLabel = dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
          const balance = snap.balance ?? (snap.intake - snap.expenditure);
          return (
            <div key={d} style={{ padding: "11px 0", borderBottom: "1px solid #EFEAE0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5, fontWeight: 500, textTransform: "capitalize" }}>{dateLabel}</span>
                <span style={{ ...styles.mono, fontSize: 12, color: balance >= 0 ? "#3F5C49" : "#A8453A" }}>
                  {balance >= 0 ? "+" : ""}{balance} kcal
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "#8A8270", marginTop: 3 }}>
                {snap.intake} kcal absorbés · {snap.expenditure} kcal dépensés · {snap.meals?.length || 0} repas · {snap.workouts?.length || 0} séance{(snap.workouts?.length || 0) > 1 ? "s" : ""}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// Mini graphique en barres groupées (deux séries)
function MiniBars({ labels, seriesA, seriesB, colorA, colorB, legendA, legendB }) {
  const max = Math.max(...seriesA, ...seriesB, 1);
  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
        <Legend color={colorA} label={legendA} />
        <Legend color={colorB} label={legendB} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130, overflowX: "auto", paddingBottom: 4 }}>
        {labels.map((lab, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 34 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
              <div style={{ width: 11, height: `${(seriesA[i] / max) * 100}%`, background: colorA, borderRadius: "3px 3px 0 0" }} />
              <div style={{ width: 11, height: `${(seriesB[i] / max) * 100}%`, background: colorB, borderRadius: "3px 3px 0 0" }} />
            </div>
            <span style={{ fontSize: 9.5, color: "#8A8270", marginTop: 5, ...styles.mono }}>{lab}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Mini graphique en ligne (une série, valeurs pouvant être nulles)
function MiniLine({ labels, values, color }) {
  const valid = values.filter((v) => v != null);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const h = 110;
  const w = Math.max(labels.length * 44, 44);
  const pts = values
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / Math.max(labels.length - 1, 1)) * (w - 20) + 10;
      const y = h - ((v - min) / range) * (h - 20) - 10;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={w} height={h + 22} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => {
          if (v == null) return null;
          const x = (i / Math.max(labels.length - 1, 1)) * (w - 20) + 10;
          const y = h - ((v - min) / range) * (h - 20) - 10;
          return <circle key={i} cx={x} cy={y} r="3.5" fill={color} />;
        })}
        {labels.map((lab, i) => {
          const x = (i / Math.max(labels.length - 1, 1)) * (w - 20) + 10;
          return (
            <text key={i} x={x} y={h + 14} fontSize="9.5" fill="#8A8270" textAnchor="middle" fontFamily="'JetBrains Mono', monospace">
              {lab}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 11.5, color: "#6B6356" }}>{label}</span>
    </div>
  );
}

// ---------- COACH AGENT ----------
function CoachAgent({ profile, meals, workouts, bio, totalIntake, totalBurn }) {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);

  // Dépense via la fonction partagée (cohérence avec l'historique)
  const totalExpenditure = computeExpenditure(profile, bio, totalBurn);
  const balance = totalIntake - totalExpenditure;
  const targetBalance = profile.targetSurplus ?? 0;
  const gap = targetBalance - balance;

  async function askCoach() {
    setLoading(true);
    try {
      const sportsList = (profile.sports || []).map((s) => (s === "Autre" && profile.autreSport ? profile.autreSport : s));
      const sportsTxt = sportsList.length ? sportsList.join(", ") : "non précisé";
      const prompt = `Tu es un coach sportif et nutrition expérimenté. Voici les données du jour pour ${profile.prenom}, ${profile.age} ans, objectif: ${profile.goal}.
Sports pratiqués: ${sportsTxt}.
Dépense énergétique totale estimée: ${totalExpenditure} kcal (métabolisme de base + pas + sport).
Apport alimentaire: ${totalIntake} kcal sur ${meals.length} repas.
Séances: ${workouts.map((w) => `${w.type} (${w.duree_min}min, ${w.kcal_estime}kcal)`).join(", ") || "aucune"}.
Biométrie: FC repos ${bio.restingHR}bpm, VFC ${bio.hrv}ms, sommeil ${bio.sleepHours}h, pas ${bio.steps}, poids ${bio.weight}kg.
Objectif calorique pour l'objectif "${profile.goal}": un delta d'environ ${targetBalance >= 0 ? "+" : ""}${targetBalance} kcal/jour par rapport à la dépense.

Donne un message de coach direct, chaleureux mais factuel, en 4-5 phrases maximum, en français, qui:
1. Résume où en est la personne par rapport à son objectif calorique du jour.
2. Donne une recommandation nutrition concrète pour la fin de journée.
3. Donne un conseil d'entraînement adapté à ses sports (${sportsTxt}) ET à son objectif. Important: quel que soit l'objectif, intègre la musculation/renforcement dans tes conseils — pour la perte de graisse (préserver la masse musculaire et augmenter la dépense au repos) comme pour la prise de masse (stimulus d'hypertrophie). Si l'objectif est la performance, oriente selon les sports pratiqués.
Ne donne pas de liste à puces, écris en prose fluide, ton de coach personnel. Adresse-toi à ${profile.prenom} directement.`;
      const text = await callClaude([{ role: "user", content: prompt }]);
      setAdvice(text.trim());
    } catch {
      setAdvice("Le coach n'a pas pu analyser tes données pour le moment. Réessaie dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Card style={{ background: "#15201C", color: "#F6F3EC", border: "none" }}>
        <SectionLabelDark>Agent Coach</SectionLabelDark>
        <p style={{ ...styles.display, fontSize: 19, margin: "2px 0 14px", lineHeight: 1.3 }}>
          Toutes les données, une seule voix.
        </p>
        <button
          onClick={askCoach}
          disabled={loading}
          style={{
            width: "100%",
            background: "#E8E1D2",
            color: "#15201C",
            border: "none",
            borderRadius: 9,
            padding: "11px 0",
            fontWeight: 600,
            fontSize: 14,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Le coach analyse…" : "Demander un point au coach"}
        </button>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        <StatBlock icon={Flame} label="Dépense estimée" value={totalExpenditure} unit="kcal" />
        <StatBlock icon={Sparkles} label="Apport" value={totalIntake} unit="kcal" />
      </div>

      <Card>
        <SectionLabel>Bilan énergétique</SectionLabel>
        <BalanceBar intake={totalIntake} expenditure={totalExpenditure} />
        <div style={{ marginTop: 12, fontSize: 13, color: "#6B6356", lineHeight: 1.5 }}>
          Solde actuel : <strong style={{ color: balance >= 0 ? "#3F5C49" : "#A8453A" }}>{balance >= 0 ? "+" : ""}{balance} kcal</strong>{" "}
          — objectif {profile.goal.toLowerCase()} : <strong>+{targetBalance} kcal</strong>.{" "}
          {gap > 0 ? (
            <>Il manque environ <strong>{gap} kcal</strong> pour atteindre l'objectif du jour.</>
          ) : (
            <>Objectif du jour atteint ou dépassé.</>
          )}
        </div>
      </Card>

      {advice && (
        <Card style={{ background: "#3F5C49", border: "none" }}>
          <SectionLabelDark>Message du coach</SectionLabelDark>
          <p style={{ color: "#F6F3EC", fontSize: 15, lineHeight: 1.55, margin: 0, ...styles.display, fontWeight: 400 }}>
            {advice}
          </p>
        </Card>
      )}
    </div>
  );
}

function StatBlock({ icon: Icon, label, value, unit }) {
  return (
    <Card style={{ marginTop: 0, padding: 14 }}>
      <Icon size={16} color="#C76B3E" />
      <div style={{ ...styles.mono, fontSize: 22, fontWeight: 600, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#8A8270", marginTop: 2 }}>
        {label} {unit && `(${unit})`}
      </div>
    </Card>
  );
}

function BalanceBar({ intake, expenditure }) {
  const max = Math.max(intake, expenditure, 1);
  return (
    <div>
      <BarRow label="Dépense" value={expenditure} max={max} color="#C76B3E" />
      <BarRow label="Apport" value={intake} max={max} color="#3F5C49" />
    </div>
  );
}

function BarRow({ label, value, max, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B6356", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={styles.mono}>{value} kcal</span>
      </div>
      <div style={{ background: "#EFEAE0", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: "100%", background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}
