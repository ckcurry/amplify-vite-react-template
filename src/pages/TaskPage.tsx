import { useEffect, useMemo, useState } from "react";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

type RecurrenceType = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export function TaskPage() {
  const [tasks, setTasks] = useState<Array<Schema["ScheduledTask"]["type"]>>(
    []
  );
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [newTaskContent, setNewTaskContent] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("NONE");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");

  useEffect(() => {
    const sub = client.models.ScheduledTask.observeQuery().subscribe({
      next: (data: any) => setTasks([...data.items]),
    });
    return () => sub.unsubscribe();
  }, []);

  function occursOnDate(
    task: Schema["ScheduledTask"]["type"],
    dateStr: string
  ): boolean {
    if (!task.scheduledFor) return false;
    const base = new Date(task.scheduledFor + "T00:00:00");
    const target = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(base.getTime()) || Number.isNaN(target.getTime())) {
      return false;
    }
    if (target < base) return false;

    const rec: RecurrenceType =
      ((task as any).recurrence as RecurrenceType) ?? "NONE";
    const end = (task as any).recurrenceEndDate
      ? new Date((task as any).recurrenceEndDate + "T00:00:00")
      : null;
    if (end && target > end) return false;

    if (rec === "NONE") return task.scheduledFor === dateStr;
    if (rec === "DAILY") return true;

    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.round(
      (target.getTime() - base.getTime()) / msPerDay
    );
    if (diffDays < 0) return false;

    if (rec === "WEEKLY") return diffDays % 7 === 0;
    if (rec === "MONTHLY") return base.getDate() === target.getDate();
    if (rec === "YEARLY")
      return (
        base.getDate() === target.getDate() &&
        base.getMonth() === target.getMonth()
      );
    return false;
  }

  const tasksForSelectedDate = useMemo(() => {
    return tasks.filter((t) => occursOnDate(t, selectedDate));
  }, [tasks, selectedDate]);

  // calendar helpers
  const selectedDateObj = new Date(selectedDate);
  const year = selectedDateObj.getFullYear();
  const monthIndex = selectedDateObj.getMonth();
  const monthName = selectedDateObj.toLocaleString(undefined, {
    month: "long",
  });
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const calendarCells: Array<{ dateString: string | null; dayNumber: number | null }> =
    [];
  for (let i = 0; i < startWeekday; i++) {
    calendarCells.push({ dateString: null, dayNumber: null });
  }
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

  async function handleAddTask(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const content = newTaskContent.trim();
    if (!content) return;
    await client.models.ScheduledTask.create({
      content,
      completed: false,
      scheduledFor: selectedDate,
      recurrence,
      recurrenceEndDate: recurrenceEndDate || null,
    });
    setNewTaskContent("");
    setRecurrence("NONE");
    setRecurrenceEndDate("");
  }

  async function toggleTask(task: Schema["ScheduledTask"]["type"]) {
    await client.models.ScheduledTask.update({
      id: task.id,
      completed: !task.completed,
    });
  }

  async function deleteTask(id: string) {
    await client.models.ScheduledTask.delete({ id });
  }

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
      <h1 style={{ textAlign: "center" }}>My Tasks</h1>

      {/* Calendar */}
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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <button type="button" onClick={goToPrevMonth}>
            ‹
          </button>
          <div style={{ fontWeight: 600 }}>
            {monthName} {year}
          </div>
          <button type="button" onClick={goToNextMonth}>
            ›
          </button>
        </div>

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
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

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
            const tasksOnDay = tasks.filter((t) =>
              occursOnDate(t, cell.dateString!)
            );
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
                {tasksOnDay.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "2px",
                      marginTop: "3px",
                      justifyContent: "center",
                      maxWidth: "100%",
                    }}
                  >
                    {tasksOnDay.slice(0, 6).map((t) => (
                      <span
                        key={t.id}
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: t.completed ? "#22c55e" : "#6366f1",
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleAddTask} style={{ marginBottom: "1rem" }}>
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
              marginBottom: "0.5rem",
            }}
          >
            <input
              type="text"
              placeholder="Task for this day"
              value={newTaskContent}
              onChange={(e) => setNewTaskContent(e.target.value)}
              style={{ flex: "1 1 220px", minWidth: 0, maxWidth: "400px" }}
            />
            <button type="submit">Add task</button>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
              fontSize: "0.9rem",
            }}
          >
            <label>
              Recurrence:&nbsp;
              <select
                value={recurrence}
                onChange={(e) =>
                  setRecurrence(e.target.value as RecurrenceType)
                }
              >
                <option value="NONE">One-time</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </label>

            {recurrence !== "NONE" && (
              <label>
                End date:&nbsp;
                <input
                  type="date"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                />
              </label>
            )}
          </div>
        </form>

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
                  onChange={() => toggleTask(t)}
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
    </main>
  );
}
