// src/pages/HouseholdHome.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

/* ===================== HOUSEHOLD HOME (calendar + buttons) ===================== */

export function HouseholdHome() {
  const [households, setHouseholds] =
    useState<Array<Schema["Household"]["type"]>>([]);
  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [householdTasks, setHouseholdTasks] = useState<
    Array<Schema["HouseholdTask"]["type"]>
  >([]);

  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [householdToJoinId, setHouseholdToJoinId] = useState("");

  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newTaskForDate, setNewTaskForDate] = useState("");

  // subscribe to household + membership + tasks
  useEffect(() => {
    const householdSub = client.models.Household.observeQuery().subscribe({
      next: (data) => setHouseholds([...data.items]),
    });

    const membershipSub =
      client.models.HouseholdMembership.observeQuery().subscribe({
        next: (data) => {
          const first = data.items[0] ?? null;
          setMembership(first);
        },
      });

    const taskSub = client.models.HouseholdTask.observeQuery().subscribe({
      next: (data) => setHouseholdTasks([...data.items]),
    });

    return () => {
      householdSub.unsubscribe();
      membershipSub.unsubscribe();
      taskSub.unsubscribe();
    };
  }, []);

  const currentHouseholdId = membership?.householdId ?? null;
  const currentHousehold =
    currentHouseholdId != null
      ? households.find((h) => h.id === currentHouseholdId) ?? null
      : null;

  const tasksForSelectedDate =
    currentHouseholdId == null
      ? []
      : householdTasks.filter(
          (t) =>
            t.householdId === currentHouseholdId &&
            t.scheduledFor === selectedDate
        );

  // Map of date -> tasks (for calendar dots)
  const tasksByDate: Record<string, Array<Schema["HouseholdTask"]["type"]>> = {};
  if (currentHouseholdId != null) {
    for (const t of householdTasks) {
      if (t.householdId !== currentHouseholdId || !t.scheduledFor) continue;
      if (!tasksByDate[t.scheduledFor]) {
        tasksByDate[t.scheduledFor] = [];
      }
      tasksByDate[t.scheduledFor].push(t);
    }
  }

  async function handleCreateHousehold(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = newHouseholdName.trim();
    if (!name || membership) return; // already in a household

    const { data: created, errors } = await client.models.Household.create({
      name,
    });

    if (!created) {
      console.error("Failed to create household", errors);
      return;
    }

    await client.models.HouseholdMembership.create({
      householdId: created.id,
    });

    setNewHouseholdName("");
  }

  async function handleJoinHousehold(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (membership) return;
    if (!householdToJoinId) return;

    await client.models.HouseholdMembership.create({
      householdId: householdToJoinId,
    });
    setHouseholdToJoinId("");
  }

  async function handleAddTaskForDate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!currentHouseholdId) return;
    const content = newTaskForDate.trim();
    if (!content) return;

    await client.models.HouseholdTask.create({
      householdId: currentHouseholdId,
      content,
      completed: false,
      scheduledFor: selectedDate,
    });

    setNewTaskForDate("");
  }

  async function toggleTaskCompleted(task: Schema["HouseholdTask"]["type"]) {
    await client.models.HouseholdTask.update({
      id: task.id,
      completed: !task.completed,
    });
  }

  async function deleteTask(id: string) {
    await client.models.HouseholdTask.delete({ id });
  }

  // ===== VISUAL CALENDAR HELPERS =====
  const selectedDateObj = new Date(selectedDate);
  const year = selectedDateObj.getFullYear();
  const monthIndex = selectedDateObj.getMonth(); // 0-11

  const monthName = selectedDateObj.toLocaleString(undefined, {
    month: "long",
  });

  const firstOfMonth = new Date(year, monthIndex, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // Build an array of calendar cells (some empty at start)
  const calendarCells: Array<{
    dateString: string | null;
    dayNumber: number | null;
  }> = [];

  // Leading empty cells
  for (let i = 0; i < startWeekday; i++) {
    calendarCells.push({ dateString: null, dayNumber: null });
  }

  // Actual days
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    const iso = d.toISOString().slice(0, 10);
    calendarCells.push({ dateString: iso, dayNumber: day });
  }

  function goToPrevMonth() {
    const d = new Date(selectedDate);
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  function goToNextMonth() {
    const d = new Date(selectedDate);
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  const weekdaysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Nicely formatted "Tasks for ..." label
  const prettySelected = new Date(selectedDate + "T00:00:00");
  const selectedLabel = prettySelected.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "1rem",
        boxSizing: "border-box",
        minHeight: "100vh",
      }}
    >
      <h1
        style={{
          fontSize: "1.75rem",
          marginBottom: "1rem",
          textAlign: "center",
          wordBreak: "break-word",
        }}
      >
        Household
      </h1>

      {/* If user has no household: show create / join options */}
      {!membership && (
        <section style={{ marginBottom: "2rem" }}>
          <p style={{ textAlign: "center" }}>
            You are not part of a household yet. Create one or join an existing
            one.
          </p>

          <div
            style={{
              display: "grid",
              gap: "1.5rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              marginTop: "1rem",
            }}
          >
            {/* Create household */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "0.5rem",
                padding: "1rem",
                background: "white",
              }}
            >
              <h2>Create household</h2>
              <form onSubmit={handleCreateHousehold}>
                <input
                  type="text"
                  placeholder="Household name"
                  value={newHouseholdName}
                  onChange={(e) => setNewHouseholdName(e.target.value)}
                  style={{ width: "100%", marginBottom: "0.75rem" }}
                />
                <button type="submit">Create household</button>
              </form>
            </div>

            {/* Join household */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "0.5rem",
                padding: "1rem",
                background: "white",
              }}
            >
              <h2>Join household</h2>
              {households.length === 0 ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>
                  No households exist yet. Create one to get started.
                </p>
              ) : (
                <form onSubmit={handleJoinHousehold}>
                  <select
                    value={householdToJoinId}
                    onChange={(e) => setHouseholdToJoinId(e.target.value)}
                    style={{ width: "100%", marginBottom: "0.75rem" }}
                  >
                    <option value="">Select a household</option>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit">Join selected household</button>
                </form>
              )}
            </div>
          </div>
        </section>
      )}

      {/* If user is in a household: show calendar + nav buttons */}
      {membership && currentHousehold && (
        <>
          <section style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ marginBottom: "0.75rem" }}>
              Your household: {currentHousehold.name}
            </h2>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginTop: "0.75rem",
              }}
            >
              <Link to="/household/projects">
                <button type="button">Household Projects</button>
              </Link>
              <Link to="/household/grocery">
                <button type="button">Grocery &amp; Dinner</button>
              </Link>
              <Link to="/household/news">
                <button type="button">Family News</button>
              </Link>
            </div>
          </section>

          {/* Task calendar */}
          <section
            style={{
              marginBottom: "2rem",
              border: "1px solid #ddd",
              borderRadius: "0.5rem",
              padding: "1rem",
              background: "white",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
              Task calendar
            </h3>

            {/* Month navigation */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <button
                type="button"
                onClick={goToPrevMonth}
                style={{ padding: "0.25rem 0.75rem" }}
              >
                ‹
              </button>
              <div style={{ fontWeight: 600 }}>
                {monthName} {year}
              </div>
              <button
                type="button"
                onClick={goToNextMonth}
                style={{ padding: "0.25rem 0.75rem" }}
              >
                ›
              </button>
            </div>

            {/* Weekday headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "0.25rem",
                marginBottom: "0.25rem",
                fontSize: "0.8rem",
                textAlign: "center",
                color: "#555",
              }}
            >
              {weekdaysShort.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "0.25rem",
                marginBottom: "1rem",
              }}
            >
              {calendarCells.map((cell, idx) => {
                if (!cell.dateString || !cell.dayNumber) {
                  return <div key={idx} />;
                }

                const isSelected = cell.dateString === selectedDate;
                const hasTasks = (tasksByDate[cell.dateString] ?? []).length > 0;

                return (
                  <button
                    key={cell.dateString}
                    type="button"
                    onClick={() => setSelectedDate(cell.dateString!)}
                    style={{
                      padding: "0.4rem 0.2rem",
                      minHeight: "40px",
                      borderRadius: "0.5rem",
                      border: isSelected ? "2px solid #646cff" : "1px solid #ddd",
                      backgroundColor: isSelected ? "#f3f4ff" : "#f9f9f9",
                      color: "#222",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.85rem",
                      position: "relative",
                    }}
                  >
                    <span>{cell.dayNumber}</span>
                    {hasTasks && (
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "#646cff",
                          marginTop: "3px",
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Add task for selected date */}
            <form
              onSubmit={handleAddTaskForDate}
              style={{ marginBottom: "1rem" }}
            >
              <label
                style={{
                  display: "block",
                  marginBottom: "0.35rem",
                  fontWeight: 500,
                }}
              >
                Tasks for {selectedLabel}
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  placeholder="Task for this day"
                  value={newTaskForDate}
                  onChange={(e) => setNewTaskForDate(e.target.value)}
                  style={{
                    flex: "1 1 220px",
                    minWidth: 0,
                    maxWidth: "400px",
                  }}
                />
                <button type="submit">Add task</button>
              </div>
            </form>

            {/* Task list for selected date */}
            {tasksForSelectedDate.length === 0 ? (
              <p style={{ color: "#888", fontStyle: "italic" }}>
                No tasks scheduled for this day.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {tasksForSelectedDate.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!t.completed}
                      onChange={() => toggleTaskCompleted(t)}
                    />
                    <span
                      style={{
                        textDecoration: t.completed ? "line-through" : "none",
                      }}
                    >
                      {t.content}
                    </span>
                    <button
                      onClick={() => deleteTask(t.id)}
                      style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}
                    >
                      delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {membership && !currentHousehold && (
        <p style={{ color: "red" }}>
          You have a household membership, but the household record could not be
          found.
        </p>
      )}
    </main>
  );
}
