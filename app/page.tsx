"use client";

import { useEffect, useState } from "react";
import { format, parse, isSameMonth, isSameWeek, isValid } from "date-fns";
import { createClient, User } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kjjcknzvskouaqxxixzg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqamNrbnp2c2tvdWFxeHhpeHpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUzNDIyMTEsImV4cCI6MjA2MDkxODIxMX0.WoNxXtafo2PjyVJluEyhxtRUnuq515AYYNbPWMVEOiU"
);

const ADMIN_EMAIL = "alex@reitsport.de";
const DAILY_TARGET_MINUTES = 8 * 60;

export default function TimeTrackingApp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [startTime, setStartTime] = useState("");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [lunchStart, setLunchStart] = useState("");
  const [lunchEnd, setLunchEnd] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthenticatedUser(user);
        fetchEntries(user);

        if (user.email === ADMIN_EMAIL) {
          supabase.from("users").select("id,email").then(({ data }) => {
            if (data) setAllUsers(data);
          });
        }
      }
    });
  }, []);

  const fetchEntries = async (user: User) => {
    const { data, error } = user.email === ADMIN_EMAIL
      ? await supabase.from("time_entries").select("*")
      : await supabase.from("time_entries").select("*").eq("user_id", user.id);
    if (!error) setEntries(data);
  };

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert("Login fehlgeschlagen: " + error.message);
    setAuthenticatedUser(data.user);
    fetchEntries(data.user);
  };

  const handleSignup = async () => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert("Registrierung fehlgeschlagen: " + error.message);
    alert("Benutzer erfolgreich erstellt. Bitte E-Mail bestätigen und einloggen.");
  };

  const calculateDuration = (
    start: string,
    breakStart: string,
    breakEnd: string,
    lunchStart: string,
    lunchEnd: string,
    end: string
  ) => {
    const parseTime = (t: string) => parse(t, "HH:mm", new Date());
    const total = (parseTime(end).getTime() - parseTime(start).getTime()) / 60000;
    const breakfast = breakStart && breakEnd ? (parseTime(breakEnd).getTime() - parseTime(breakStart).getTime()) / 60000 : 0;
    const lunch = lunchStart && lunchEnd ? (parseTime(lunchEnd).getTime() - parseTime(lunchStart).getTime()) / 60000 : 0;
    const duration = total - breakfast - lunch;
    return `${Math.floor(duration / 60)}h ${duration % 60}min`;
  };

  const calculateMinutes = (durationStr: string) => {
    if (!durationStr || typeof durationStr !== "string" || !durationStr.includes("h")) return 0;
    const parts = durationStr.split(/[h\s]+/).map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
    return parts[0] * 60 + parts[1];
  };

  const handleSave = async () => {
    if (!startTime || !endTime) return alert("Bitte Start- und Endzeit angeben.");

    const duration = calculateDuration(startTime, breakStart, breakEnd, lunchStart, lunchEnd, endTime);

    const { data, error } = await supabase.from("time_entries").insert({
      user_id: authenticatedUser!.id,
      date: format(new Date(), "yyyy-MM-dd"),
      startTime,
      breakStart,
      breakEnd,
      lunchStart,
      lunchEnd,
      endTime,
      duration
    });

    if (!error) fetchEntries(authenticatedUser!);
    setStartTime("");
    setBreakStart("");
    setBreakEnd("");
    setLunchStart("");
    setLunchEnd("");
    setEndTime("");
  };

  const exportCSV = () => {
    const csvHeader = "Datum,Startzeit,Frühstücksbeginn,Frühstücksende,Mittagsbeginn,Mittagsende,Endzeit,Arbeitszeit\n";
    const csvRows = entries.map(e =>
      `${e.date},${e.startTime},${e.breakStart || ""},${e.breakEnd || ""},${e.lunchStart || ""},${e.lunchEnd || ""},${e.endTime},${e.duration}`
    ).join("\n");
    const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Monatsreport_${format(new Date(), "yyyy_MM")}.csv`;
    link.click();
  };

  const exportMonthlyReportForUser = async (userId: string) => {
    if (!userId) return;

    const { data: userEntries, error } = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", userId);

    if (error || !userEntries) {
      alert("Fehler beim Laden der Einträge.");
      return;
    }

    const filtered = userEntries.filter(e => {
      const entryDate = parse(e.date, "yyyy-MM-dd", new Date());
      return isValid(entryDate) && isSameMonth(entryDate, new Date());
    });

    const csvHeader = "Datum,Startzeit,Frühstücksbeginn,Frühstücksende,Mittagsbeginn,Mittagsende,Endzeit,Arbeitszeit\n";
    const csvRows = filtered.map(e =>
      `${e.date},${e.startTime},${e.breakStart || ""},${e.breakEnd || ""},${e.lunchStart || ""},${e.lunchEnd || ""},${e.endTime},${e.duration}`
    ).join("\n");

    const unterschrift = "\n\nUnterschrift Mitarbeiter: _____________________________";

    const blob = new Blob([csvHeader + csvRows + unterschrift], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Monatsreport_${userId}_${format(new Date(), "yyyy_MM")}.csv`;
    link.click();
  };

  const currentMonthEntries = entries.filter(e => {
    const entryDate = parse(e.date, "yyyy-MM-dd", new Date());
    return isValid(entryDate) && isSameMonth(entryDate, new Date());
  });

  const currentWeekEntries = entries.filter(e => {
    const entryDate = parse(e.date, "yyyy-MM-dd", new Date());
    return isValid(entryDate) && isSameWeek(entryDate, new Date(), { weekStartsOn: 1 });
  });

  const monthlyTotalMinutes = currentMonthEntries.reduce((sum, e) => sum + calculateMinutes(e.duration), 0);
  const monthlyTotalFormatted = `${Math.floor(monthlyTotalMinutes / 60)}h ${monthlyTotalMinutes % 60}min`;
  const monthlyTarget = DAILY_TARGET_MINUTES * currentMonthEntries.length;
  const monthlyDiff = monthlyTotalMinutes - monthlyTarget;

  const weeklyTotalMinutes = currentWeekEntries.reduce((sum, e) => sum + calculateMinutes(e.duration), 0);
  const weeklyTotalFormatted = `${Math.floor(weeklyTotalMinutes / 60)}h ${weeklyTotalMinutes % 60}min`;

  const incompleteDays = entries.filter(e => !e.startTime || !e.endTime);

  if (!authenticatedUser) {
    return (
      <div style={{ padding: '1rem', maxWidth: '400px', margin: '0 auto' }}>
        <h2>{isLoginMode ? "Login" : "Registrieren"}</h2>
        <input type="email" placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }} />
        <input type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }} />
        <button onClick={isLoginMode ? handleLogin : handleSignup} style={{ padding: '0.5rem 1rem', marginRight: '0.5rem' }}>{isLoginMode ? "Login" : "Registrieren"}</button>
        <button onClick={() => setIsLoginMode(!isLoginMode)} style={{ padding: '0.5rem 1rem' }}>{isLoginMode ? "Noch kein Konto?" : "Schon registriert?"}</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Zeiterfassung ({authenticatedUser.email})</h2>

      <label>Arbeitsbeginn:<br/><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ display: 'block', marginBottom: '0.5rem' }} /></label>
      <label>Frühstücksbeginn:<br/><input type="time" value={breakStart} onChange={e => setBreakStart(e.target.value)} style={{ display: 'block', marginBottom: '0.5rem' }} /></label>
      <label>Frühstücksende:<br/><input type="time" value={breakEnd} onChange={e => setBreakEnd(e.target.value)} style={{ display: 'block', marginBottom: '0.5rem' }} /></label>
      <label>Mittagspause Beginn:<br/><input type="time" value={lunchStart} onChange={e => setLunchStart(e.target.value)} style={{ display: 'block', marginBottom: '0.5rem' }} /></label>
      <label>Mittagspause Ende:<br/><input type="time" value={lunchEnd} onChange={e => setLunchEnd(e.target.value)} style={{ display: 'block', marginBottom: '0.5rem' }} /></label>
      <label>Arbeitsende:<br/><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ display: 'block', marginBottom: '0.5rem' }} /></label>

      <button onClick={handleSave} style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>Speichern</button>
      <button onClick={exportCSV} style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>Monatsreport exportieren</button>

      {authenticatedUser.email === ADMIN_EMAIL && (
        <div style={{ marginBottom: '1rem' }}>
          <label>Mitarbeiter auswählen für Monatsreport:</label>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.5rem' }}>
            <option value="">-- Bitte wählen --</option>
            {allUsers.map(user => (
              <option key={user.id} value={user.id}>{user.email}</option>
            ))}
          </select>
          <button onClick={() => exportMonthlyReportForUser(selectedUserId)} style={{ marginTop: '0.5rem', padding: '0.5rem 1rem' }} disabled={!selectedUserId}>
            Report exportieren
          </button>
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <h3>Zeiten</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {entries.map((entry, index) => (
            <li key={index} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '0.5rem', marginBottom: '0.5rem' }}>
              <strong>{entry.date}</strong>: {entry.startTime} - {entry.endTime} (Frühstück: {entry.breakStart || "-"}-{entry.breakEnd || "-"}, Mittag: {entry.lunchStart || "-"}-{entry.lunchEnd || "-"}) → <strong>{entry.duration}</strong>
            </li>
          ))}
        </ul>

        <h3>Arbeitszeit im aktuellen Monat</h3>
        <p><strong>{monthlyTotalFormatted}</strong> ({monthlyDiff >= 0 ? "+" : ""}{Math.floor(monthlyDiff / 60)}h {monthlyDiff % 60}min zum Soll)</p>

        <h3>Arbeitszeit in dieser Woche</h3>
        <p><strong>{weeklyTotalFormatted}</strong></p>

        {incompleteDays.length > 0 && (
          <div style={{ marginTop: '1rem', color: 'red' }}>
            <h4>Unvollständige Einträge:</h4>
            <ul>
              {incompleteDays.map((e, idx) => <li key={idx}>{e.date}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}



