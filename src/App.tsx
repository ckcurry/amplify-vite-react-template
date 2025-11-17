import { useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();

function App() {
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [projects, setProjects] = useState<Array<Schema["Project"]["type"]>>([]);

  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false);
  const [newTodoContent, setNewTodoContent] = useState("");

  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // 3 active task slots (store todo IDs)
  const [activeSlots, setActiveSlots] = useState<Array<string | null>>([
    null,
    null,
    null,
  ]);

  const { signOut } = useAuthenticator();

  useEffect(() => {
    const todoSub = client.models.Todo.observeQuery().subscribe({
      next: (data) => setTodos([...data.items]),
    });

    // subscribe to projects as well
    const projectSub = client.models.Project.observeQuery().subscribe({
      next: (data) => setProjects([...data.items]),
    });

    return () => {
      todoSub.unsubscribe();
      projectSub.unsubscribe();
    };
  }, []);

  // ====== TODOS ======
  function openTodoDialog() {
    setNewTodoContent("");
    setIsTodoDialogOpen(true);
  }

  function closeTodoDialog() {
    setIsTodoDialogOpen(false);
  }

  async function handleCreateTodo(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const content = newTodoContent.trim();
    if (!content) return;

    await client.models.Todo.create({ content });
    setNewTodoContent("");
    setIsTodoDialogOpen(false);
  }

  function handleSlotChange(slotIndex: number, todoId: string) {
    setActiveSlots((prev) => {
      const copy = [...prev];
      copy[slotIndex] = todoId || null;
      return copy;
    });
  }

  async function deleteTodo(id: string) {
    // Clear it from any active slot(s)
    setActiveSlots((prev) => prev.map((slotId) => (slotId === id ? null : slotId)));
    await client.models.Todo.delete({ id });
  }

  // ====== PROJECTS ======
  function openProjectDialog() {
    setNewProjectName("");
    setIsProjectDialogOpen(true);
  }

  function closeProjectDialog() {
    setIsProjectDialogOpen(false);
  }

  async function handleCreateProject(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    // assumes your Project model has a "name" field
    await client.models.Project.create({ name });
    setNewProjectName("");
    setIsProjectDialogOpen(false);
  }

  return (
    <main>
      <h1>My todos</h1>

      {/* Buttons row */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button onClick={openTodoDialog}>+ new task</button>
        <button onClick={openProjectDialog}>+ new project</button>
      </div>

      {/* Three active task slots */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Active Tasks</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "1rem",
          }}
        >
          {activeSlots.map((slotTodoId, index) => {
            const todo = todos.find((t) => t.id === slotTodoId);
            return (
              <div
                key={index}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  minHeight: "120px",
                }}
              >
                <h3>Slot {index + 1}</h3>
                <select
                  value={slotTodoId ?? ""}
                  onChange={(e) => handleSlotChange(index, e.target.value)}
                  style={{ width: "100%", marginBottom: "0.75rem" }}
                >
                  <option value="">-- Select a task --</option>
                  {todos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.content}
                    </option>
                  ))}
                </select>

                {todo ? (
                  <div
                    style={{
                      background: "#f3f3f3",
                      padding: "0.5rem",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                    }}
                    onClick={() => deleteTodo(todo.id)}
                    title="Click to delete this task"
                  >
                    {todo.content}
                  </div>
                ) : (
                  <div style={{ color: "#888", fontStyle: "italic" }}>
                    No task selected
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Projects section */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Projects</h2>
        {projects.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No projects yet. Click &quot;+ new project&quot; to add one.
          </p>
        ) : (
          <ul>
            {projects.map((project) => (
              <li key={project.id}>{project.name}</li>
            ))}
          </ul>
        )}
      </section>

      <div>

      <button onClick={signOut} style={{ marginTop: "1rem" }}>
        Sign out
      </button>

      {/* ===== Todo Dialog ===== */}
      {isTodoDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={closeTodoDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              minWidth: "300px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New task</h2>
            <form onSubmit={handleCreateTodo}>
              <input
                type="text"
                placeholder="Task content"
                value={newTodoContent}
                onChange={(e) => setNewTodoContent(e.target.value)}
                style={{ width: "100%", marginBottom: "1rem" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button type="button" onClick={closeTodoDialog}>
                  Cancel
                </button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Project Dialog ===== */}
      {isProjectDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={closeProjectDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              minWidth: "300px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New project</h2>
            <form onSubmit={handleCreateProject}>
              <input
                type="text"
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                style={{ width: "100%", marginBottom: "1rem" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button type="button" onClick={closeProjectDialog}>
                  Cancel
                </button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;

