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
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [currentEntry, setCurrentEntry] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthenticatedUser(user);
        fetchEntries(user);
        fetchOrCreateTodayEntry(user);
      }
    });
  }, []);

  const fetchEntries = async (user: User) => {
    const { data, error } = user.email === ADMIN_EMAIL
      ? await supabase.from("time_entries").select("*")
      : await supabase.from("time_entries").select("*").eq("user_id", user.id);
    if (!error && data) setEntries(data);
  };

  const fetchOrCreateTodayEntry = async (user: User) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: existingEntries } = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today);

    if (existingEntries && existingEntries.length > 0) {
      setCurrentEntry(existingEntries[0]);
    } else {
      const { data: newEntry } = await supabase
        .from("time_entries")
        .insert({ user_id: user.id, date: today })
        .select();
      if (newEntry && newEntry.length > 0) setCurrentEntry(newEntry[0]);
    }
  };

  const updateTimeField = async (field: string, value: string) => {
    if (!authenticatedUser || !currentEntry) return;

    const updatedEntry = { ...currentEntry, [field]: value };

    if (updatedEntry.startTime && updatedEntry.endTime) {
      updatedEntry.duration = calculateDuration(
        updatedEntry.startTime,
        updatedEntry.breakStart,
        updatedEntry.breakEnd,
        updatedEntry.lunchStart,
        updatedEntry.lunchEnd,
        updatedEntry.endTime
      );
    }

    const { data, error } = await supabase
      .from("time_entries")
      .update(updatedEntry)
      .eq("id", currentEntry.id)
      .select();

    if (!error && data && data.length > 0) {
      setCurrentEntry(data[0]);
      fetchEntries(authenticatedUser);
    }
  };

  const calculateDuration = (start: string, breakStart: string, breakEnd: string, lunchStart: string, lunchEnd: string, end: string) => {
    const parseTime = (t: string) => parse(t, "HH:mm", new Date());
    const total = (parseTime(end).getTime() - parseTime(start).getTime()) / 60000;
    const breakfast = breakStart && breakEnd ? (parseTime(breakEnd).getTime() - parseTime(breakStart).getTime()) / 60000 : 0;
    const lunch = lunchStart && lunchEnd ? (parseTime(lunchEnd).getTime() - parseTime(lunchStart).getTime()) / 60000 : 0;
    const duration = total - breakfast - lunch;
    return `${Math.floor(duration / 60)}h ${duration % 60}min`;
  };

  const exportCSV = () => {
    const csvHeader = "Datum,Nutzer-ID,Startzeit,Frühstücksbeginn,Frühstücksende,Mittagsbeginn,Mittagsende,Endzeit,Arbeitszeit\n";
    const csvRows = entries.map(e =>
      `${e.date},${e.user_id},${e.startTime || ""},${e.breakStart || ""},${e.breakEnd || ""},${e.lunchStart || ""},${e.lunchEnd || ""},${e.endTime || ""},${e.duration || ""}`
    ).join("\n");
    const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Monatsreport_${format(new Date(), "yyyy_MM")}.csv`;
    link.click();
  };

  const renderTimeInput = (label: string, field: string, value: string) => (
    <label>
      {label}:<br />
      <input
        type="time"
        value={value || ""}
        onChange={e => updateTimeField(field, e.target.value)}
        style={{ display: 'block', marginBottom: '0.5rem', backgroundColor: '#fff', color: '#000' }}
      />
    </label>
  );

  const currentMonthEntries = entries.filter(e => {
    const entryDate = parse(e.date, "yyyy-MM-dd", new Date());
    return isValid(entryDate) && isSameMonth(entryDate, new Date());
  });

  const monthlyTotalMinutes = currentMonthEntries.reduce((sum, e) => {
    const parts = e.duration?.split(/[h\s]+/).map(Number);
    if (parts?.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return sum + parts[0] * 60 + parts[1];
    }
    return sum;
  }, 0);

  const monthlyTotalFormatted = `${Math.floor(monthlyTotalMinutes / 60)}h ${monthlyTotalMinutes % 60}min`;
  const monthlyTarget = DAILY_TARGET_MINUTES * currentMonthEntries.length;
  const monthlyDiff = monthlyTotalMinutes - monthlyTarget;

  if (!authenticatedUser) {
    return (
      <div style={{ padding: '1rem', maxWidth: '400px', margin: '0 auto' }}>
        <h2>{isLoginMode ? "Login" : "Registrieren"}</h2>
        <input type="email" placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }} />
        <input type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }} />
        <button style={{ padding: '0.5rem 1rem', marginRight: '0.5rem' }}>Login</button>
        <button onClick={() => setIsLoginMode(!isLoginMode)} style={{ padding: '0.5rem 1rem' }}>{isLoginMode ? "Noch kein Konto?" : "Schon registriert?"}</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Zeiterfassung ({authenticatedUser.email})</h2>
      {renderTimeInput("Arbeitsbeginn", "startTime", currentEntry?.startTime)}
      {renderTimeInput("Frühstücksbeginn", "breakStart", currentEntry?.breakStart)}
      {renderTimeInput("Frühstücksende", "breakEnd", currentEntry?.breakEnd)}
      {renderTimeInput("Mittagspause Beginn", "lunchStart", currentEntry?.lunchStart)}
      {renderTimeInput("Mittagspause Ende", "lunchEnd", currentEntry?.lunchEnd)}
      {renderTimeInput("Arbeitsende", "endTime", currentEntry?.endTime)}

      <button onClick={exportCSV} style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>
        Monatsreport exportieren
      </button>

      <h3>Alle Einträge im aktuellen Monat</h3>
      <p><strong>{monthlyTotalFormatted}</strong> ({monthlyDiff >= 0 ? "+" : ""}{Math.floor(monthlyDiff / 60)}h {monthlyDiff % 60}min zum Soll)</p>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {entries.map((entry, index) => (
          <li key={index} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '0.5rem', marginBottom: '0.5rem' }}>
            <strong>{entry.date}</strong> – <em>{entry.user_id}</em><br />
            {entry.startTime || "-"} - {entry.endTime || "-"} (Frühstück: {entry.breakStart || "-"}-{entry.breakEnd || "-"}, Mittag: {entry.lunchStart || "-"}-{entry.lunchEnd || "-"}) → <strong>{entry.duration || "-"}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}




