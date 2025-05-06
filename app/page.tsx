//testzeile
"use client";

import { useEffect, useState } from "react";
import { format, parse, isSameMonth, isSameWeek, isValid } from "date-fns";
import { createClient, User } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAIL = "alex@reitsport.de";
const DAILY_TARGET_MINUTES = 8 * 60;

interface TimeEntry {
  id: string;
  user_id: string;
  date: string;
  startTime?: string;
  endTime?: string;
  breakStart?: string;
  breakEnd?: string;
  lunchStart?: string;
  lunchEnd?: string;
  duration?: string;
  email?: string;
}

export default function TimeTrackingApp() {
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [allUserEntries, setAllUserEntries] = useState<{ user: string; total: string }[]>([]);
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setAuthenticatedUser(user);
        await fetchEntries(user);
        await fetchOrCreateTodayEntry(user);
        if (user.email === ADMIN_EMAIL) await fetchAllUserSummaries();
      }
    });
  }, []);

  const fetchEntries = async (user: User) => {
    const { data, error } = await supabase.from("time_entries").select("*");
    if (!error && data) setEntries(user.email === ADMIN_EMAIL ? data : data.filter((e: TimeEntry) => e.user_id === user.id));
  };

  const fetchAllUserSummaries = async () => {
    const { data: allEntries } = await supabase.from("time_entries").select("*");
    const { data: users } = await supabase.from("auth.users").select("id,email");
    if (!allEntries || !users) return;
    const currentMonth = new Date();
    const summaries: { [key: string]: number } = {};

    allEntries.forEach(entry => {
      const entryDate = parse(entry.date, "yyyy-MM-dd", new Date());
      if (isValid(entryDate) && isSameMonth(entryDate, currentMonth) && entry.duration) {
        const minutes = calculateMinutes(entry.duration);
        summaries[entry.user_id] = (summaries[entry.user_id] || 0) + minutes;
      }
    });

    const summaryList = users
      .filter(u => summaries[u.id])
      .map(u => ({
        user: u.email,
        total: `${Math.floor(summaries[u.id] / 60)}h ${summaries[u.id] % 60}min`
      }));
    setAllUserEntries(summaryList);
  };

  const fetchOrCreateTodayEntry = async (user: User) => {
    setLoadingEntry(true);
    const today = format(new Date(), "yyyy-MM-dd");
    try {
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
    } catch (e) {
      console.error("Fehler bei fetchOrCreateTodayEntry:", e);
    } finally {
      setLoadingEntry(false);
    }
  };

  const updateTimeField = async (field: string, value: string) => {
    if (!authenticatedUser || !currentEntry) return;

    const updatedEntry = { ...currentEntry, [field]: value };

    if (updatedEntry.startTime && updatedEntry.endTime) {
      updatedEntry.duration = calculateDuration(
        updatedEntry.startTime || "",
        updatedEntry.breakStart || "",
        updatedEntry.breakEnd || "",
        updatedEntry.lunchStart || "",
        updatedEntry.lunchEnd || "",
        updatedEntry.endTime || ""
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
      if (authenticatedUser.email === ADMIN_EMAIL) fetchAllUserSummaries();
    }
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
    return `${Math.floor((total - breakfast - lunch) / 60)}h ${Math.round((total - breakfast - lunch) % 60)}min`;
  };

  const calculateMinutes = (durationStr: string) => {
    const parts = durationStr.match(/(\d+)h\s*(\d+)min/);
    if (!parts || parts.length < 3) return 0;
    return parseInt(parts[1]) * 60 + parseInt(parts[2]);
  };

  const renderTimeInput = (label: string, field: string, value?: string) => (
    <label>
      {label}:<br />
      <input
        type="time"
        value={value || ""}
        onChange={e => updateTimeField(field, e.target.value)}
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          backgroundColor: '#f1f1f1',
          color: '#111',
          border: '1px solid #ccc',
          borderRadius: '6px',
          padding: '0.4rem'
        }}
      />
    </label>
  );

  const currentMonthEntries = entries.filter(e => {
    const entryDate = parse(e.date, "yyyy-MM-dd", new Date());
    return isValid(entryDate) && isSameMonth(entryDate, new Date());
  });

  const currentWeekEntries = entries.filter(e => {
    const entryDate = parse(e.date, "yyyy-MM-dd", new Date());
    return isValid(entryDate) && isSameWeek(entryDate, new Date(), { weekStartsOn: 1 });
  });

  const monthlyTotalMinutes = currentMonthEntries.reduce((sum, e) => sum + calculateMinutes(e.duration || ""), 0);
  const monthlyTotalFormatted = `${Math.floor(monthlyTotalMinutes / 60)}h ${monthlyTotalMinutes % 60}min`;
  const monthlyTarget = DAILY_TARGET_MINUTES * currentMonthEntries.length;
  const monthlyDiff = monthlyTotalMinutes - monthlyTarget;

  const weeklyTotalMinutes = currentWeekEntries.reduce((sum, e) => sum + calculateMinutes(e.duration || ""), 0);
  const weeklyTotalFormatted = `${Math.floor(weeklyTotalMinutes / 60)}h ${weeklyTotalMinutes % 60}min`;

  const incompleteDays = entries.filter(e => !e.startTime || !e.endTime);

  const exportCSV = () => {
    const csvHeader = "Datum,Startzeit,Frühstücksbeginn,Frühstücksende,Mittagsbeginn,Mittagsende,Endzeit,Arbeitszeit\n";
    const csvRows = entries.map(e =>
      `${e.date},${e.startTime || ""},${e.breakStart || ""},${e.breakEnd || ""},${e.lunchStart || ""},${e.lunchEnd || ""},${e.endTime || ""},${e.duration || ""}`
    ).join("\n");
    const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Monatsreport_${format(new Date(), "yyyy_MM")}.csv`;
    link.click();
  };

  return (
    <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Zeiterfassung ({authenticatedUser?.email})</h2>

      {authenticatedUser && renderTimeInput("Arbeitsbeginn", "startTime", currentEntry?.startTime)}
      {authenticatedUser && renderTimeInput("Frühstücksbeginn", "breakStart", currentEntry?.breakStart)}
      {authenticatedUser && renderTimeInput("Frühstücksende", "breakEnd", currentEntry?.breakEnd)}
      {authenticatedUser && renderTimeInput("Mittagspause Beginn", "lunchStart", currentEntry?.lunchStart)}
      {authenticatedUser && renderTimeInput("Mittagspause Ende", "lunchEnd", currentEntry?.lunchEnd)}
      {authenticatedUser && renderTimeInput("Arbeitsende", "endTime", currentEntry?.endTime)}

      <button onClick={exportCSV} style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>Monatsreport exportieren</button>

      <h3>Arbeitszeit im aktuellen Monat:</h3>
      <p><strong>{monthlyTotalFormatted}</strong> ({monthlyDiff >= 0 ? "+" : ""}{Math.floor(monthlyDiff / 60)}h {monthlyDiff % 60}min zum Soll)</p>

      <h3>Arbeitszeit in dieser Woche:</h3>
      <p><strong>{weeklyTotalFormatted}</strong></p>

      {authenticatedUser?.email === ADMIN_EMAIL && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Monatssummen aller Mitarbeiter:</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.5rem' }}>Mitarbeiter</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.5rem' }}>Arbeitszeit</th>
              </tr>
            </thead>
            <tbody>
              {allUserEntries.map((entry, index) => (
                <tr key={index}>
                  <td style={{ padding: '0.5rem' }}>{entry.user}</td>
                  <td style={{ padding: '0.5rem' }}>{entry.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {incompleteDays.length > 0 && (
        <div style={{ marginTop: '1rem', color: 'red' }}>
          <h4>Unvollständige Einträge:</h4>
          <ul>
            {incompleteDays.map((e, idx) => <li key={idx}>{e.date}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
















