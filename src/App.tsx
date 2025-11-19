import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../amplify/data/resource";
import { uploadData, getUrl } from "aws-amplify/storage";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();



/* ===================== HOUSEHOLD PROJECTS PAGE ===================== */




/* ===================== GROCERY + DINNER PAGE ===================== */

function HouseholdGroceryPage() {
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


/* ===================== FAMILY NEWS PAGE ===================== */

function FamilyNewsPage() {
  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [projects, setProjects] = useState<
    Array<Schema["HouseholdProject"]["type"]>
  >([]);
  const [milestones, setMilestones] = useState<
    Array<Schema["HouseholdMilestone"]["type"]>
  >([]);
  const [updates, setUpdates] = useState<
    Array<Schema["HouseholdMilestoneUpdate"]["type"]>
  >([]);

  useEffect(() => {
    const membershipSub =
      client.models.HouseholdMembership.observeQuery().subscribe({
        next: (data) => setMembership(data.items[0] ?? null),
      });

    const projectSub =
      client.models.HouseholdProject.observeQuery().subscribe({
        next: (data) => setProjects([...data.items]),
      });

    const milestoneSub =
      client.models.HouseholdMilestone.observeQuery().subscribe({
        next: (data) => setMilestones([...data.items]),
      });

    const updateSub =
      client.models.HouseholdMilestoneUpdate.observeQuery().subscribe({
        next: (data) => setUpdates([...data.items]),
      });

    return () => {
      membershipSub.unsubscribe();
      projectSub.unsubscribe();
      milestoneSub.unsubscribe();
      updateSub.unsubscribe();
    };
  }, []);

  const currentHouseholdId = membership?.householdId ?? null;

  if (!membership || !currentHouseholdId) {
    return (
      <main>
        <h1>Family news</h1>
        <p>You need to be part of a household to see family news.</p>
      </main>
    );
  }

  const householdProjects = projects.filter(
    (p) => p.householdId === currentHouseholdId
  );
  const householdProjectIds = new Set(householdProjects.map((p) => p.id));

  const householdMilestones = milestones.filter((m) =>
    householdProjectIds.has(m.projectId)
  );
  const milestoneById = new Map(householdMilestones.map((m) => [m.id, m]));

  const householdUpdates = updates
    .filter((u) => milestoneById.has(u.milestoneId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  function getProjectNameForUpdate(update: Schema["HouseholdMilestoneUpdate"]["type"]) {
    const milestone = milestoneById.get(update.milestoneId);
    if (!milestone) return "";
    const project = householdProjects.find((p) => p.id === milestone.projectId);
    return project?.name ?? "";
  }

  function getMilestoneTitle(update: Schema["HouseholdMilestoneUpdate"]["type"]) {
    const milestone = milestoneById.get(update.milestoneId);
    return milestone?.title ?? "";
  }

  return (
    <main>
      <h1>Family news</h1>
      <p>
        All recent updates from household projects, across every member, newest
        first.
      </p>

      {householdUpdates.length === 0 ? (
        <p style={{ color: "#888", fontStyle: "italic", marginTop: "1rem" }}>
          No updates yet.
        </p>
      ) : (
        <ul style={{ marginTop: "1rem" }}>
          {householdUpdates.map((u) => (
            <li
              key={u.id}
              style={{
                borderBottom: "1px solid #eee",
                padding: "0.5rem 0",
                marginBottom: "0.25rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "#666" }}>
                {new Date(u.createdAt).toLocaleString()}
              </div>
              <div style={{ fontWeight: "bold" }}>
                {getProjectNameForUpdate(u)} &mdash;{" "}
                {getMilestoneTitle(u) || "Milestone"}
              </div>
              <div>{u.note || "Video update"}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}



/* ===================== SIMPLE EXTRA PAGES ===================== */

function Page2() {
  return (
    <main>
      <h1>Page 2</h1>
      <p>Custom content for page 2.</p>
    </main>
  );
}

function Page3() {
  return (
    <main>
      <h1>Page 3</h1>
      <p>Custom content for page 3.</p>
    </main>
  );
}

function Page4() {
  return (
    <main>
      <h1>Page 4</h1>
      <p>Custom content for page 4.</p>
    </main>
  );
}

function Page5() {
  return (
    <main>
      <h1>Page 5</h1>
      <p>Custom content for page 5.</p>
    </main>
  );
}

/* ===================== APP SHELL WITH MENU BUTTON ===================== */

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <BrowserRouter>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #ddd",
          marginBottom: "1rem",
        }}
      >
        <span style={{ fontWeight: "bold" }}>My App</span>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            style={{ padding: "0.5rem 0.75rem" }}
          >
            Menu ▾
          </button>

          {menuOpen && (
            <nav
              style={{
                position: "absolute",
                right: 0,
                marginTop: "0.25rem",
                background: "white",
                border: "1px solid #ddd",
                borderRadius: "0.5rem",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                minWidth: "180px",
                zIndex: 1000,
              }}
            >
              <ul style={{ listStyle: "none", padding: "0.5rem", margin: 0 }}>
                <li>
                  <Link
                    to="/"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    to="/household"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Household
                  </Link>
                </li>
                <li>
                  <Link
                    to="/page2"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Page 2
                  </Link>
                </li>
                <li>
                  <Link
                    to="/page3"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Page 3
                  </Link>
                </li>
                <li>
                  <Link
                    to="/page4"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Page 4
                  </Link>
                </li>
                <li>
                  <Link
                    to="/page5"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Page 5
                  </Link>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/household" element={<HouseholdHome />} />
        <Route path="/household/projects" element={<HouseholdProjectsPage />} />
        <Route path="/household/grocery" element={<HouseholdGroceryPage />} />
        <Route path="/household/news" element={<FamilyNewsPage />} />
        {/* your other pages */}
        <Route path="/page2" element={<Page2 />} />
        <Route path="/page3" element={<Page3 />} />
        <Route path="/page4" element={<Page4 />} />
        <Route path="/page5" element={<Page5 />} />
      </Routes>

    </BrowserRouter>
  );
}

export default App;
