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

  return (
    <main>
      <h1>Household</h1>

      {/* If user has no household: show create / join options */}
      {!membership && (
        <section style={{ marginBottom: "2rem" }}>
          <p>
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
            <h2>Your household: {currentHousehold.name}</h2>

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
          <section>
            <h3>Task calendar</h3>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <label>
                Date:&nbsp;
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </label>
            </div>

            <form
              onSubmit={handleAddTaskForDate}
              style={{ marginBottom: "1rem" }}
            >
              <input
                type="text"
                placeholder="Task for this day"
                value={newTaskForDate}
                onChange={(e) => setNewTaskForDate(e.target.value)}
                style={{ width: "100%", maxWidth: "400px", marginRight: "0.5rem" }}
              />
              <button type="submit">Add task</button>
            </form>

            {tasksForSelectedDate.length === 0 ? (
              <p style={{ color: "#888", fontStyle: "italic" }}>
                No tasks scheduled for this day.
              </p>
            ) : (
              <ul>
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

