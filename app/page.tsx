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
}

export default function TimeTrackingApp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(null);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [allUsers, setAllUsers] = useState<Partial<User>[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthenticatedUser(user);
        fetchEntries(user);
        fetchOrCreateTodayEntry(user);
        fetchUserList();
      }
    });
  }, []);

  const fetchUserList = async () => {
    const { data: userIds } = await supabase.from("time_entries").select("user_id");
    if (userIds) {
      const uniqueUserIds = Array.from(new Set(userIds.map((e) => e.user_id)));
      const { data: usersData, error } = await supabase
        .from("auth.users")
        .select("id,email")
        .in("id", uniqueUserIds);

      if (!error && usersData) {
        const typedUsers = usersData.map((u) => ({ id: u.id, email: u.email })) as Partial<User>[];
        setAllUsers(typedUsers);
      }
    }
  };

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
    const duration = total - breakfast - lunch;
    return `${Math.floor(duration / 60)}h ${Math.round(duration % 60)}min`;
  };

  const calculateMinutes = (durationStr: string) => {
    const parts = durationStr.match(/(\d+)h\s*(\d+)min/);
    if (!parts || parts.length < 3) return 0;
    return parseInt(parts[1]) * 60 + parseInt(parts[2]);
  };

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

  const currentMonthEntries = entries.filter(e => {
    const entryDate = parse(e.date, "yyyy-MM-dd", new Date());
    return isValid(entryDate) && isSameMonth(entryDate, new Date());
  });

  const monthlyTotalMinutes = currentMonthEntries.reduce((sum, e) => sum + calculateMinutes(e.duration || ""), 0);
  const monthlyTotalFormatted = `${Math.floor(monthlyTotalMinutes / 60)}h ${monthlyTotalMinutes % 60}min`;

  const currentWeekEntries = entries.filter(e => {
    const entryDate = parse(e.date, "yyyy-MM-dd", new Date());
    return isValid(entryDate) && isSameWeek(entryDate, new Date(), { weekStartsOn: 1 });
  });

  const monthlyTarget = DAILY_TARGET_MINUTES * currentMonthEntries.length;
  const monthlyDiff = monthlyTotalMinutes - monthlyTarget;

  const weeklyTotalMinutes = currentWeekEntries.reduce((sum, e) => sum + calculateMinutes(e.duration || ""), 0);
  const weeklyTotalFormatted = `${Math.floor(weeklyTotalMinutes / 60)}h ${weeklyTotalMinutes % 60}min`;

  const incompleteDays = entries.filter(e => !e.startTime || !e.endTime);

  const renderTimeInput = (label: string, field: string, value?: string) => (
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

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Zeiterfassung ({authenticatedUser?.email})</h2>
      {renderTimeInput("Arbeitsbeginn", "startTime", currentEntry?.startTime)}
      {renderTimeInput("Frühstücksbeginn", "breakStart", currentEntry?.breakStart)}
      {renderTimeInput("Frühstücksende", "breakEnd", currentEntry?.breakEnd)}
      {renderTimeInput("Mittagspause Beginn", "lunchStart", currentEntry?.lunchStart)}
      {renderTimeInput("Mittagspause Ende", "lunchEnd", currentEntry?.lunchEnd)}
      {renderTimeInput("Arbeitsende", "endTime", currentEntry?.endTime)}

      <button onClick={exportCSV} style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>Monatsreport exportieren</button>

      <h3>Arbeitszeit im aktuellen Monat:</h3>
      <p><strong>{monthlyTotalFormatted}</strong> ({monthlyDiff >= 0 ? "+" : ""}{Math.floor(monthlyDiff / 60)}h {monthlyDiff % 60}min zum Soll)</p>

      <h3>Arbeitszeit in dieser Woche:</h3>
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
  );
}







