// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { uploadData } from "aws-amplify/storage";
import { getCurrentUser } from "aws-amplify/auth";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

/* ===================== TYPES & CONSTANTS ===================== */

type RecurrenceType = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

type SlotValue =
  | { source: "todo"; id: string }
  | { source: "household"; id: string }
  | { source: "personal"; id: string }
  | null;

const ACTIVE_SLOTS_STORAGE_KEY = "dashboard_activeSlots_v2";

function getTodayLocalDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const diffDays = Math.round((target.getTime() - base.getTime()) / msPerDay);
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

/* ===================== DASHBOARD ===================== */

export function Dashboard() {
  const { signOut } = useAuthenticator();

  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [projects, setProjects] = useState<Array<Schema["Project"]["type"]>>([]);
  const [milestones, setMilestones] = useState<
    Array<Schema["Milestone"]["type"]>
  >([]);
  const [scheduledTasks, setScheduledTasks] = useState<
    Array<Schema["ScheduledTask"]["type"]>
  >([]);

  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [householdTasks, setHouseholdTasks] = useState<
    Array<Schema["HouseholdTask"]["type"]>
  >([]);

// Project dialog
const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
const [newProjectName, setNewProjectName] = useState("");
const [newProjectMilestones, setNewProjectMilestones] = useState<string[]>([]);
const [newProjectMilestoneInput, setNewProjectMilestoneInput] = useState("");

  // 3 active task slots (each holds a personal task or a household task)
  const [activeSlots, setActiveSlots] = useState<SlotValue[]>([
    null,
    null,
    null,
  ]);

  // Task picker dialog (for slots)
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);

  // Active project for the dashboard
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // ===== Update dialog for active project =====
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [selectedMilestoneIdForUpdate, setSelectedMilestoneIdForUpdate] =
    useState<string | null>(null);
  const [newUpdateNote, setNewUpdateNote] = useState("");
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUploadingUpdate, setIsUploadingUpdate] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const today = useMemo(() => getTodayLocalDateString(), []);

  /* ===================== SUBSCRIPTIONS ===================== */

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
        next: (data: any) => {
          const first = data.items[0] ?? null;
          setMembership(first);
        },
      });

    const householdTaskSub =
      client.models.HouseholdTask.observeQuery().subscribe({
        next: (data: any) => setHouseholdTasks([...data.items]),
      });

    const personalTaskSub =
      client.models.ScheduledTask.observeQuery().subscribe({
        next: (data: any) => setScheduledTasks([...data.items]),
      });

    return () => {
      todoSub.unsubscribe();
      projectSub.unsubscribe();
      milestoneSub.unsubscribe();
      membershipSub.unsubscribe();
      householdTaskSub.unsubscribe();
      personalTaskSub.unsubscribe();
    };
  }, []);

  // Get signed-in user id to filter personal projects
  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setCurrentUserId(user.userId);
      })
      .catch((err) => {
        console.error("Failed to load current user", err);
        if (!cancelled) setCurrentUserId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ===================== LOCAL STORAGE FOR SLOTS & ACTIVE PROJECT ===================== */

  // Load slots + active project from localStorage on first render
  useEffect(() => {
    try {
      const storedSlots = window.localStorage.getItem(ACTIVE_SLOTS_STORAGE_KEY);
      if (storedSlots) {
        const parsed = JSON.parse(storedSlots) as SlotValue[];
        if (Array.isArray(parsed) && parsed.length === 3) {
          setActiveSlots(parsed);
        }
      }
    } catch {
      // ignore parse errors
    }

    const storedProjectId = window.localStorage.getItem("activeProjectId");
    if (storedProjectId) {
      setActiveProjectId(storedProjectId);
    }
  }, []);

  // Persist active slots whenever they change
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ACTIVE_SLOTS_STORAGE_KEY,
        JSON.stringify(activeSlots)
      );
    } catch {
      // ignore storage errors
    }
  }, [activeSlots]);

  // Persist active project selection
  useEffect(() => {
    try {
      if (activeProjectId) {
        window.localStorage.setItem("activeProjectId", activeProjectId);
      } else {
        window.localStorage.removeItem("activeProjectId");
      }
    } catch {
      // ignore
    }
  }, [activeProjectId]);

  /* ===================== HELPERS ===================== */

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

  async function deleteTodo(id: string) {
    await client.models.Todo.delete({ id });
  }

  /* ===================== HOUSEHOLD TASKS (TODAY) ===================== */

  const currentHouseholdId = membership?.householdId ?? null;

  const todaysHouseholdTasks = useMemo(() => {
    if (!currentHouseholdId) return [];
    return householdTasks.filter(
      (t) => t.householdId === currentHouseholdId && t.scheduledFor === today
    );
  }, [householdTasks, currentHouseholdId, today]);

  // Exclude tasks that are already claimed in slots
  const usedHouseholdTaskIds = new Set(
    activeSlots
      .filter((s): s is { source: "household"; id: string } => !!s && s.source === "household")
      .map((s) => s.id)
  );

  const availableHouseholdTasks = todaysHouseholdTasks.filter(
    (t) => !usedHouseholdTaskIds.has(t.id)
  );

  // Same for todos: don't show those already chosen in slots
  const usedTodoIds = new Set(
    activeSlots
      .filter((s): s is { source: "todo"; id: string } => !!s && s.source === "todo")
      .map((s) => s.id)
  );

  const availableTodos = todos.filter((t) => !usedTodoIds.has(t.id));

  const usedPersonalTaskIds = new Set(
    activeSlots
      .filter((s): s is { source: "personal"; id: string } => !!s && s.source === "personal")
      .map((s) => s.id)
  );

  const todaysPersonalTasks = useMemo(() => {
    return scheduledTasks.filter(
      (t) => occursOnDate(t, today) && !t.completed
    );
  }, [scheduledTasks, today]);

  const availablePersonalTasks = todaysPersonalTasks.filter(
    (t) => !usedPersonalTaskIds.has(t.id)
  );

  /* ===================== SLOTS & TASK PICKER ===================== */

  function openTaskPickerForSlot(index: number) {
    setPickerSlotIndex(index);
    setIsTaskPickerOpen(true);
  }

  function closeTaskPicker() {
    setPickerSlotIndex(null);
    setIsTaskPickerOpen(false);
  }

  function claimTaskForSlot(slotIndex: number, value: SlotValue) {
    setActiveSlots((prev) => {
      const copy = [...prev];
      copy[slotIndex] = value;
      return copy;
    });
    closeTaskPicker();
  }

  // Finish: for personal todos, delete; for household just unclaim
  async function handleFinishSlot(slotIndex: number) {
    const slot = activeSlots[slotIndex];
    if (!slot) return;

    if (slot.source === "todo") {
      await deleteTodo(slot.id);
    } else if (slot.source === "personal") {
      await client.models.ScheduledTask.update({
        id: slot.id,
        completed: true,
      });
    }

    setActiveSlots((prev) => {
      const copy = [...prev];
      copy[slotIndex] = null;
      return copy;
    });
  }

  // Do later: just clear the slot (no deletion / no completion flags)
  function handleDoLaterSlot(slotIndex: number) {
    setActiveSlots((prev) => {
      const copy = [...prev];
      copy[slotIndex] = null;
      return copy;
    });
  }

  /* ===================== PROJECTS ===================== */

function openProjectDialog() {
  setNewProjectName("");
  setNewProjectMilestones([]);
  setNewProjectMilestoneInput("");
  setIsProjectDialogOpen(true);
}

  function closeProjectDialog() {
    setIsProjectDialogOpen(false);
  }

  function addNewProjectMilestone() {
    const title = newProjectMilestoneInput.trim();
    if (!title) return;
    setNewProjectMilestones((prev) => [...prev, title]);
    setNewProjectMilestoneInput("");
  }

  function removeNewProjectMilestone(index: number) {
    setNewProjectMilestones((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateProject(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    const { data: createdProject } = await client.models.Project.create({
      name,
    });

    if (createdProject) {
      for (const title of newProjectMilestones) {
        const t = title.trim();
        if (!t) continue;
        await client.models.Milestone.create({
          title: t,
          projectId: createdProject.id,
        });
      }
    }

    setNewProjectName("");
    setNewProjectMilestones([]);
    setNewProjectMilestoneInput("");
    setIsProjectDialogOpen(false);
  }

  const myProjects = useMemo(() => {
    if (!currentUserId) return [];
    return projects.filter(
      (p) => (p as any).owner === currentUserId || (p as any).createdBy === currentUserId
    );
  }, [projects, currentUserId]);

  useEffect(() => {
    if (activeProjectId && !myProjects.some((p) => p.id === activeProjectId)) {
      setActiveProjectId(null);
    }
  }, [activeProjectId, myProjects]);

  const activeProject =
    activeProjectId != null
      ? myProjects.find((p) => p.id === activeProjectId) ?? null
      : null;

  const activeProjectMilestones = activeProject
    ? milestones.filter((m) => m.projectId === activeProject.id)
    : [];

  /* ===================== UPDATES (ACTIVE PROJECT) ===================== */

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

  /* ===================== RENDER ===================== */

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
        <Link to="/tasks">
          <button type="button">Manage tasks</button>
        </Link>
        <button onClick={openProjectDialog}>+ new project</button>
      </div>

      {/* Active slots */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Active Tasks</h2>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Today: {today}
          {membership && currentHouseholdId
            ? " • claiming from your household + personal tasks"
            : " • personal tasks only (no household membership)"}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {activeSlots.map((slot, index) => {
            let label = "No task selected";
            let subt = "";
            let exists = true;

            if (slot?.source === "todo") {
              const t = todos.find((todo) => todo.id === slot.id);
              if (t) {
                label = t.content ?? "(untitled task)";
                subt = "My task";
              } else {
                label = "Task no longer exists";
                subt = "Click Do later to clear";
                exists = false;
              }
            } else if (slot?.source === "household") {
              const ht = householdTasks.find((h) => h.id === slot.id);
              if (ht) {
                label = ht.content ?? "(household task)";
                subt = `Household task for ${ht.scheduledFor}`;
              } else {
                label = "Household task no longer exists";
                subt = "Click Do later to clear";
                exists = false;
              }
            } else if (slot?.source === "personal") {
              const pt = scheduledTasks.find((p) => p.id === slot.id);
              if (pt) {
                label = pt.content ?? "(personal task)";
                const recurrence = ((pt as any).recurrence as RecurrenceType) ?? "NONE";
                const baseSubtext = pt.scheduledFor
                  ? `Personal task for ${pt.scheduledFor}`
                  : "Personal task";
                subt =
                  recurrence && recurrence !== "NONE"
                    ? `${baseSubtext} • repeats ${recurrence.toLowerCase()}`
                    : baseSubtext;
              } else {
                label = "Personal task no longer exists";
                subt = "Click Do later to clear";
                exists = false;
              }
            }

            const isEmpty = slot == null;

            return (
              <div
                key={index}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  minHeight: "120px",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <h3>Slot {index + 1}</h3>

                {isEmpty ? (
                  <>
                    <p
                      style={{
                        color: "#888",
                        fontStyle: "italic",
                        marginTop: "0.5rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      No task selected.
                    </p>
                    <button onClick={() => openTaskPickerForSlot(index)}>
                      Pick task
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        background: "#f3f3f3",
                        padding: "0.5rem",
                        borderRadius: "0.25rem",
                        wordBreak: "break-word",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <div>{label}</div>
                      {subt && (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "#666",
                            marginTop: "0.25rem",
                          }}
                        >
                          {subt}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleFinishSlot(index)}
                        disabled={!exists && slot?.source !== "todo"}
                      >
                        Finished
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDoLaterSlot(index)}
                      >
                        Do later
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Active project */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Active Project</h2>

        {myProjects.length === 0 ? (
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
              {myProjects.map((p) => (
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

              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{ display: "block", marginBottom: "0.35rem" }}
                >
                  Milestones (optional)
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    marginBottom: "0.5rem",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Milestone title"
                    value={newProjectMilestoneInput}
                    onChange={(e) => setNewProjectMilestoneInput(e.target.value)}
                    style={{ flex: "1 1 200px", minWidth: 0 }}
                  />
                  <button type="button" onClick={addNewProjectMilestone}>
                    Add
                  </button>
                </div>
                {newProjectMilestones.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                    {newProjectMilestones.map((title, idx) => (
                      <li
                        key={`${title}-${idx}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          marginBottom: "0.35rem",
                        }}
                      >
                        <span>{title}</span>
                        <button
                          type="button"
                          onClick={() => removeNewProjectMilestone(idx)}
                          style={{ fontSize: "0.8rem" }}
                        >
                          remove
                        </button>
                      </li>
                    ))}
                  </ul>
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

      {/* ===== Task picker dialog (for slots) ===== */}
      {isTaskPickerOpen && pickerSlotIndex !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
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
              maxWidth: "520px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Pick task for Slot {pickerSlotIndex + 1}</h2>

            {/* Household tasks for today */}
            <section style={{ marginBottom: "1rem" }}>
              <h3>Today&apos;s household tasks</h3>
              {!currentHouseholdId ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>
                  You&apos;re not in a household.
                </p>
              ) : availableHouseholdTasks.length === 0 ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>
                  No unclaimed household tasks for today.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {availableHouseholdTasks.map((t) => (
                    <li key={t.id} style={{ marginBottom: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() =>
                          claimTaskForSlot(pickerSlotIndex, {
                            source: "household",
                            id: t.id,
                          })
                        }
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "#f3f3f3",
                          color: "#222",
                        }}
                      >
                        {t.content}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Personal scheduled tasks */}
            <section style={{ marginBottom: "1rem" }}>
              <h3>My personal tasks today</h3>
              {availablePersonalTasks.length === 0 ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>
                  No personal tasks scheduled for today.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {availablePersonalTasks.map((t) => {
                    const recurrence =
                      ((t as any).recurrence as RecurrenceType) ?? "NONE";
                    return (
                      <li key={t.id} style={{ marginBottom: "0.5rem" }}>
                        <button
                          type="button"
                          onClick={() =>
                            claimTaskForSlot(pickerSlotIndex, {
                              source: "personal",
                              id: t.id,
                            })
                          }
                          style={{
                            width: "100%",
                            textAlign: "left",
                            background: "#eef2ff",
                            color: "#222",
                          }}
                        >
                          <div>{t.content}</div>
                          <div
                            style={{
                              fontSize: "0.85rem",
                              color: "#444",
                            }}
                          >
                            Scheduled for {t.scheduledFor}
                            {recurrence && recurrence !== "NONE"
                              ? ` • repeats ${recurrence.toLowerCase()}`
                              : ""}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Personal todos */}
            <section>
              <h3>My tasks</h3>
              {availableTodos.length === 0 ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>
                  No available tasks. Create a new one on the dashboard.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {availableTodos.map((t) => (
                    <li key={t.id} style={{ marginBottom: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() =>
                          claimTaskForSlot(pickerSlotIndex, {
                            source: "todo",
                            id: t.id,
                          })
                        }
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "#f9f9f9",
                          color: "#222",
                        }}
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
