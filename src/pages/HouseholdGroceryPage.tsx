import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";


export function HouseholdGroceryPage() {
  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [tasks, setTasks] = useState<Array<Schema["HouseholdTask"]["type"]>>(
    []
  );

  const [newGroceryItem, setNewGroceryItem] = useState("");
  const [newDinnerItem, setNewDinnerItem] = useState("");

  const groceryPrefix = "GROCERY: ";
  const dinnerPrefix = "DINNER: ";

  useEffect(() => {
    const membershipSub =
      client.models.HouseholdMembership.observeQuery().subscribe({
        next: (data) => setMembership(data.items[0] ?? null),
      });

    const taskSub = client.models.HouseholdTask.observeQuery().subscribe({
      next: (data) => setTasks([...data.items]),
    });

    return () => {
      membershipSub.unsubscribe();
      taskSub.unsubscribe();
    };
  }, []);

  const currentHouseholdId = membership?.householdId ?? null;

  const householdTasks = currentHouseholdId
    ? tasks.filter((t) => t.householdId === currentHouseholdId)
    : [];

  const groceryItems = householdTasks.filter((t) =>
    t.content.startsWith(groceryPrefix)
  );
  const dinnerItems = householdTasks.filter((t) =>
    t.content.startsWith(dinnerPrefix)
  );

  function stripPrefix(content: string, prefix: string) {
    return content.startsWith(prefix) ? content.slice(prefix.length) : content;
  }

  async function createTaskWithPrefix(
    text: string,
    prefix: string,
    e?: React.FormEvent
  ) {
    if (e) e.preventDefault();
    if (!currentHouseholdId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    await client.models.HouseholdTask.create({
      householdId: currentHouseholdId,
      content: `${prefix}${trimmed}`,
      completed: false,
    });
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

  if (!membership) {
    return (
      <main>
        <h1>Grocery &amp; Dinner</h1>
        <p>You need to be part of a household to use shared lists.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Grocery &amp; Dinner</h1>
      <p>
        Everyone in your household can add, check off, and remove items on these
        shared lists.
      </p>

      {/* Grocery list */}
      <section style={{ marginTop: "1.5rem", marginBottom: "2rem" }}>
        <h2>Grocery list</h2>
        <form
          onSubmit={(e) => createTaskWithPrefix(newGroceryItem, groceryPrefix, e)}
          style={{ marginBottom: "0.75rem" }}
        >
          <input
            type="text"
            placeholder="Add grocery item"
            value={newGroceryItem}
            onChange={(e) => setNewGroceryItem(e.target.value)}
            style={{ width: "100%", maxWidth: "400px", marginRight: "0.5rem" }}
          />
          <button type="submit">Add</button>
        </form>

        {groceryItems.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No grocery items yet.
          </p>
        ) : (
          <ul>
            {groceryItems.map((t) => (
              <li
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
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
                  {stripPrefix(t.content, groceryPrefix)}
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

      {/* Dinner recommendations */}
      <section>
        <h2>Dinner recommendations</h2>
        <form
          onSubmit={(e) => createTaskWithPrefix(newDinnerItem, dinnerPrefix, e)}
          style={{ marginBottom: "0.75rem" }}
        >
          <input
            type="text"
            placeholder="Add dinner idea"
            value={newDinnerItem}
            onChange={(e) => setNewDinnerItem(e.target.value)}
            style={{ width: "100%", maxWidth: "400px", marginRight: "0.5rem" }}
          />
          <button type="submit">Add</button>
        </form>

        {dinnerItems.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No dinner ideas yet.
          </p>
        ) : (
          <ul>
            {dinnerItems.map((t) => (
              <li
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
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
                  {stripPrefix(t.content, dinnerPrefix)}
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
