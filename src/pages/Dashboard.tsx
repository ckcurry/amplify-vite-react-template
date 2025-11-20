// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { uploadData } from "aws-amplify/storage";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

/* ===================== TYPES ===================== */

type SlotTaskRef =
  | { kind: "todo"; id: string }
  | { kind: "household"; id: string };

type RecurrenceType = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

/* ===================== HELPERS ===================== */

// Local "today" in YYYY-MM-DD (fixes the "tomorrow" bug)
function getTodayLocalISODate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  const local = new Date(now.getTime() - offsetMs);
  return local.toISOString().slice(0, 10);
}

// Recurrence logic reused for household tasks (same idea as HouseholdHome)
function occursOnDate(
  task: Schema["HouseholdTask"]["type"],
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

  if (rec === "NONE") {
    return task.scheduledFor === dateStr;
  }

  if (rec === "DAILY") {
    return true;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.round(
    (target.getTime() - base.getTime()) / msPerDay
  );
  if (diffDays < 0) return false;

  if (rec === "WEEKLY") {
    return diffDays % 7 === 0;
  }

  if (rec === "MONTHLY") {
    return base.getDate() === target.getDate();
  }

  return false;
}

// Helper: get video duration
async function getVideoDurationInSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = () => {
      reject(new Error("Failed to load video metadata"));
    };

    video.src = URL.createObjectURL(file);
  });
}

/* ===================== DASHBOARD ===================== */

export function Dashboard() {
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [projects, setProjects] =
    useState<Array<Schema["Project"]["type"]>>([]);
  const [milestones, setMilestones] = useState<
    Array<Schema["Milestone"]["type"]>
  >([]);

  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [householdTasks, setHouseholdTasks] = useState<
    Array<Schema["HouseholdTask"]["type"]>
  >([]);

  // Todo dialog
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false);
  const [newTodoContent, setNewTodoContent] = useState("");

  // Project dialog
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // 3 active task slots (linked tasks, not copies)
  const [activeSlots, setActiveSlots] = useState<Array<SlotTaskRef | null>>([
    null,
    null,
    null,
  ]);

  // Active project for the dashboard
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // Update dialog for active project
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [selectedMilestoneIdForUpdate, setSelectedMilestoneIdForUpdate] =
    useState<string | null>(null);
  const [newUpdateNote, setNewUpdateNote] = useState("");
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUploadingUpdate, setIsUploadingUpdate] = useState(false);

  // Task picker dialog (for slots)
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [taskPickerSlotIndex, setTaskPickerSlotIndex] = useState<number | null>(
    null
  );

  const { user, signOut } = useAuthenticator();

  const currentUserId =
    (user as any)?.userId ?? (user as any)?.username ?? null;

  // ===== SUBSCRIPTIONS =====
  useEffect(() => {
    const todoSub = client.models.Todo.observeQuery().subscribe({
      next: (data: any) => setTodos([...data.items]),
    });

    const projectSub = client.models.Project.observeQuery().subscribe({
      next: (data: any) => setProjects([...data.items]),
    });

    const milestoneSub = client.models.Milestone.observeQuery().subscribe({
      next: (data: any) => setMilestones([...data.items]),
    });

    const membershipSub =
      client.models.HouseholdMembership.observeQuery().subscribe({
        next: (data: any) => setMembership(data.items[0] ?? null),
      });

    const householdTaskSub =
      client.models.HouseholdTask.observeQuery().subscribe({
        next: (data: any) => setHouseholdTasks([...data.items]),
      });

    return () => {
      todoSub.unsubscribe();
      projectSub.unsubscribe();
      milestoneSub.unsubscribe();
      membershipSub.unsubscribe();
      householdTaskSub.unsubscribe();
    };
  }, []);

  const currentHouseholdId = membership?.householdId ?? null;

  // ===== ACTIVE PROJECT PERSISTENCE =====
  useEffect(() => {
    const stored = window.localStorage.getItem("activeProjectId");
    if (stored) {
      setActiveProjectId(stored);
    }
  }, []);

  useEffect(() => {
    if (activeProjectId) {
      window.localStorage.setItem("activeProjectId", activeProjectId);
    } else {
      window.localStorage.removeItem("activeProjectId");
    }
  }, [activeProjectId]);

  // ===== TODAY'S HOUSEHOLD TASKS (for slots) =====
  const todayStr = getTodayLocalISODate();

  const todayHouseholdTasks = householdTasks.filter(
    (t) =>
      t.householdId === currentHouseholdId &&
      !t.completed &&
      occursOnDate(t, todayStr)
  );

  // Filter out tasks that are already in another slot
  const activeHouseholdTaskIds = new Set(
    activeSlots
      .filter((r): r is SlotTaskRef => r != null)
      .filter((r) => r.kind === "household")
      .map((r) => r.id)
  );

  const activeTodoIds = new Set(
    activeSlots
      .filter((r): r is SlotTaskRef => r != null)
      .filter((r) => r.kind === "todo")
      .map((r) => r.id)
  );

  // Only household tasks that:
  // - are not completed
  // - are not already in another slot
  // - and either unclaimed, or claimed by the current user (so you can re-pick your own)
  const availableHouseholdTasks = todayHouseholdTasks.filter((t) => {
    if (activeHouseholdTaskIds.has(t.id)) return false;
    const claimedByUserId = (t as any).claimedByUserId as
      | string
      | null
      | undefined;
    if (!claimedByUserId) return true;
    return claimedByUserId === currentUserId;
  });

  // Personal todos that are not already in another slot
  // (no "completed" field in Todo model anymore)
  const availableTodos = todos.filter(
    (t) => !activeTodoIds.has(t.id)
  );

  // ===== TODOS =====
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

  function clearSlot(slotIndex: number) {
    setActiveSlots((prev) => {
      const copy = [...prev];
      copy[slotIndex] = null;
      return copy;
    });
  }

  async function handleSlotFinished(slotIndex: number) {
    const ref = activeSlots[slotIndex];
    if (!ref) return;

    try {
      if (ref.kind === "todo") {
        // Personal todo: treat "Finished" as delete
        const todo = todos.find((t) => t.id === ref.id);
        if (todo) {
          await client.models.Todo.delete({ id: todo.id });
        }
      } else {
        // Household task: mark completed = true (on shared model)
        const task = householdTasks.find((t) => t.id === ref.id);
        if (task) {
          await client.models.HouseholdTask.update({
            id: task.id,
            completed: true,
          });
        }
      }
    } finally {
      clearSlot(slotIndex);
    }
  }

  function handleSlotDoLater(slotIndex: number) {
    // Just free the slot; underlying task stays the same (still claimed if household)
    clearSlot(slotIndex);
  }

  // ===== PROJECTS (create + active project only) =====
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

    await client.models.Project.create({ name });
    setNewProjectName("");
    setIsProjectDialogOpen(false);
  }

  // ===== ACTIVE PROJECT DERIVED DATA =====
  const activeProject =
    activeProjectId != null
      ? projects.find((p) => p.id === activeProjectId) ?? null
      : null;

  const activeProjectMilestones = activeProject
    ? milestones.filter((m) => m.projectId === activeProject.id)
    : [];

  // ===== UPDATE (for active project) =====
  function openUpdateDialog() {
    if (!activeProject || activeProjectMilestones.length === 0) return;
    const firstMilestone = activeProjectMilestones[0];
    setSelectedMilestoneIdForUpdate(firstMilestone.id);
    setNewUpdateNote("");
    setSelectedVideoFile(null);
    setUpdateError(null);
    setIsUpdateDialogOpen(true);
  }

  function closeUpdateDialog() {
    setIsUpdateDialogOpen(false);
    setSelectedMilestoneIdForUpdate(null);
    setSelectedVideoFile(null);
    setUpdateError(null);
  }

  async function handleCreateUpdate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!selectedMilestoneIdForUpdate) {
      setUpdateError("Please select a milestone.");
      return;
    }
    if (!selectedVideoFile) {
      setUpdateError("Please select a video file.");
      return;
    }

    try {
      setIsUploadingUpdate(true);
      setUpdateError(null);

      const durationSeconds = await getVideoDurationInSeconds(selectedVideoFile);
      if (durationSeconds > 60) {
        setIsUploadingUpdate(false);
        setUpdateError("Video must be 60 seconds or less.");
        return;
      }

      const path = `milestone-updates/${selectedMilestoneIdForUpdate}/${Date.now()}-${selectedVideoFile.name}`;

      const result = await uploadData({
        path,
        data: selectedVideoFile,
        options: {
          contentType: selectedVideoFile.type,
        },
      }).result;

      const note = newUpdateNote.trim();

      await client.models.MilestoneUpdate.create({
        milestoneId: selectedMilestoneIdForUpdate,
        note,
        videoUrl: result?.path ?? path,
        durationSeconds: Math.round(durationSeconds),
      });

      setNewUpdateNote("");
      setSelectedVideoFile(null);
      setIsUpdateDialogOpen(false);
      setSelectedMilestoneIdForUpdate(null);
    } catch (err) {
      console.error("Upload failed:", err);
      setUpdateError(
        err instanceof Error
          ? err.message
          : "Something went wrong uploading the video."
      );
    } finally {
      setIsUploadingUpdate(false);
    }
  }

  // ===== TASK PICKER =====
  function openTaskPicker(slotIndex: number) {
    setTaskPickerSlotIndex(slotIndex);
    setIsTaskPickerOpen(true);
  }

  function closeTaskPicker() {
    setIsTaskPickerOpen(false);
    setTaskPickerSlotIndex(null);
  }

  async function handleSelectTaskForSlot(ref: SlotTaskRef) {
    if (taskPickerSlotIndex == null) return;

    // If user picks a household task, link it, don't copy:
    // - set claimedByUserId on the HouseholdTask (if we have a logged-in user)
    if (ref.kind === "household" && currentUserId) {
      const task = householdTasks.find((t) => t.id === ref.id);
      if (task) {
        const claimedByUserId = (task as any).claimedByUserId as
          | string
          | null
          | undefined;
        if (claimedByUserId !== currentUserId) {
          await client.models.HouseholdTask.update({
            id: task.id,
            claimedByUserId: currentUserId,
          });
        }
      }
    }

    setActiveSlots((prev) => {
      const copy = [...prev];
      copy[taskPickerSlotIndex] = ref;
      return copy;
    });

    closeTaskPicker();
  }

  function renderSlotContent(slotIndex: number) {
    const ref = activeSlots[slotIndex];

    if (!ref) {
      // Empty slot → show button to open task picker
      return (
        <button
          type="button"
          onClick={() => openTaskPicker(slotIndex)}
          style={{ width: "100%" }}
        >
          Choose task
        </button>
      );
    }

    let label = "";
    let isHousehold = false;

    if (ref.kind === "todo") {
      const todo = todos.find((t) => t.id === ref.id);
      label = todo?.content ?? "(missing task)";
      isHousehold = false;
    } else {
      const task = householdTasks.find((t) => t.id === ref.id);
      label = task?.content ?? "(missing household task)";
      isHousehold = true;
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            background: "#f3f3f3",
            padding: "0.5rem",
            borderRadius: "0.25rem",
            wordBreak: "break-word",
          }}
        >
          <div style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>
            {label}
          </div>
          {isHousehold && (
            <span
              style={{
                fontSize: "0.75rem",
                padding: "0.1rem 0.45rem",
                borderRadius: "999px",
                backgroundColor: "#e0f5ff",
                color: "#005b86",
                border: "1px solid #9ad4ff",
              }}
            >
              household task
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => handleSlotFinished(slotIndex)}
          >
            Finished
          </button>
          <button
            type="button"
            onClick={() => handleSlotDoLater(slotIndex)}
          >
            Do later
          </button>
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        width: "100%",
        padding: "1rem",
        boxSizing: "border-box",
        minHeight: "100vh",
      }}
    >
      <h1
        style={{
          fontSize: "1.75rem",
          marginBottom: "1.5rem",
          textAlign: "center",
          wordBreak: "break-word",
        }}
      >
        Project by Smallworld
      </h1>

      {/* Top buttons */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1.25rem",
          justifyContent: "center",
        }}
      >
        <button onClick={openTodoDialog}>+ new task</button>
        <button onClick={openProjectDialog}>+ new project</button>
      </div>

      {/* Active slots */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Active Tasks</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {activeSlots.map((_, index) => (
            <div
              key={index}
              style={{
                border: "1px solid #ccc",
                borderRadius: "0.5rem",
                padding: "1rem",
                minHeight: "120px",
                boxSizing: "border-box",
              }}
            >
              <h3>Slot {index + 1}</h3>
              {renderSlotContent(index)}
            </div>
          ))}
        </div>
      </section>

      {/* Active project */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Active Project</h2>

        {projects.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No projects yet. Create a project to choose an active one.
          </p>
        ) : (
          <>
            <select
              value={activeProjectId ?? ""}
              onChange={(e) => setActiveProjectId(e.target.value || null)}
              style={{
                width: "100%",
                maxWidth: "400px",
                marginBottom: "0.75rem",
              }}
            >
              <option value="">-- Select active project --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {activeProject ? (
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  marginTop: "0.5rem",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <h3 style={{ margin: 0, wordBreak: "break-word" }}>
                    {activeProject.name}
                  </h3>

                  <button
                    onClick={openUpdateDialog}
                    disabled={activeProjectMilestones.length === 0}
                  >
                    + add update
                  </button>
                </div>

                {activeProjectMilestones.length === 0 ? (
                  <p style={{ color: "#888", fontStyle: "italic" }}>
                    No milestones yet for this project.
                  </p>
                ) : (
                  <ul style={{ marginLeft: "1rem" }}>
                    {activeProjectMilestones.map((m) => (
                      <li key={m.id}>• {m.title}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p style={{ color: "#888", fontStyle: "italic" }}>
                No active project selected.
              </p>
            )}
          </>
        )}
      </section>

      <button onClick={signOut} style={{ marginTop: "1rem" }}>
        Sign out
      </button>

      {/* ===== Todo dialog ===== */}
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
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={closeTodoDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              width: "100%",
              maxWidth: "420px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
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
                  flexWrap: "wrap",
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

      {/* ===== Project dialog ===== */}
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
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={closeProjectDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              width: "100%",
              maxWidth: "420px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
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
                  flexWrap: "wrap",
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

      {/* ===== Update dialog (for active project) ===== */}
      {isUpdateDialogOpen && activeProject && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={closeUpdateDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              width: "100%",
              maxWidth: "440px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New update</h2>

            {/* Milestone picker for this active project */}
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Milestone
            </label>
            <select
              value={selectedMilestoneIdForUpdate ?? ""}
              onChange={(e) =>
                setSelectedMilestoneIdForUpdate(e.target.value || null)
              }
              style={{
                width: "100%",
                marginBottom: "1rem",
              }}
            >
              {activeProjectMilestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>

            <form onSubmit={handleCreateUpdate}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Video (max 60 seconds)
              </label>
              <input
                type="file"
                accept="video/*"
                capture="user"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedVideoFile(file);
                  setUpdateError(null);
                }}
                style={{ marginBottom: "1rem", width: "100%" }}
              />

              <textarea
                placeholder="Optional note about this update"
                value={newUpdateNote}
                onChange={(e) => setNewUpdateNote(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "80px",
                  marginBottom: "0.75rem",
                  resize: "vertical",
                }}
              />

              {updateError && (
                <div
                  style={{
                    color: "red",
                    marginBottom: "0.75rem",
                    fontSize: "0.9rem",
                  }}
                >
                  {updateError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={closeUpdateDialog}
                  disabled={isUploadingUpdate}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isUploadingUpdate}>
                  {isUploadingUpdate ? "Uploading..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Task picker dialog ===== */}
      {isTaskPickerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={closeTaskPicker}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              width: "100%",
              maxWidth: "480px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
              Choose a task
            </h2>

            {/* Household tasks for today */}
            <section style={{ marginBottom: "1rem" }}>
              <h3
                style={{
                  fontSize: "1rem",
                  marginTop: 0,
                  marginBottom: "0.5rem",
                }}
              >
                Today&apos;s household tasks
              </h3>
              {availableHouseholdTasks.length === 0 ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>
                  No household tasks available for today.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {availableHouseholdTasks.map((t) => (
                    <li
                      key={t.id}
                      style={{
                        marginBottom: "0.35rem",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectTaskForSlot({
                            kind: "household",
                            id: t.id,
                          })
                        }
                        style={{
                          width: "100%",
                          textAlign: "left",
                          backgroundColor: "#f7fbff",
                          borderColor: "#c4ddff",
                        }}
                      >
                        {t.content}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Personal tasks */}
            <section>
              <h3
                style={{
                  fontSize: "1rem",
                  marginTop: 0,
                  marginBottom: "0.5rem",
                }}
              >
                Your personal tasks
              </h3>
              {availableTodos.length === 0 ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>
                  No personal tasks available.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {availableTodos.map((t) => (
                    <li
                      key={t.id}
                      style={{
                        marginBottom: "0.35rem",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectTaskForSlot({
                            kind: "todo",
                            id: t.id,
                          })
                        }
                        style={{ width: "100%", textAlign: "left" }}
                      >
                        {t.content}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "1rem",
              }}
            >
              <button type="button" onClick={closeTaskPicker}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
