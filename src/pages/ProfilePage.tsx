import { useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Link } from "react-router-dom";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

export function ProfilePage() {
  const { signOut } = useAuthenticator();
  const [profile, setProfile] =
    useState<Schema["UserProfile"]["type"] | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sub = client.models.UserProfile.observeQuery().subscribe({
      next: (data: any) => {
        const first = data.items[0] ?? null;
        setProfile(first);
        if (first?.displayName) {
          setDisplayName(first.displayName);
        }
      },
    });
    return () => sub.unsubscribe();
  }, []);

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = displayName.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (profile) {
        await client.models.UserProfile.update({
          id: profile.id,
          displayName: name,
        });
      } else {
        await client.models.UserProfile.create({ displayName: name });
      }
    } finally {
      setSaving(false);
    }
  }

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
      <h1>Profile</h1>
      <p style={{ marginBottom: "1rem" }}>
        {profile?.displayName
          ? `Display name: ${profile.displayName}`
          : "Set your display name so others can recognize you."}
      </p>

      <form onSubmit={handleSave} style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.35rem" }}>
          Display name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ width: "100%", maxWidth: "360px", marginBottom: "0.5rem" }}
        />
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : profile ? "Update profile" : "Create profile"}
          </button>
          <Link to="/projects">
            <button type="button">Go to Projects</button>
          </Link>
        </div>
      </form>

      <button onClick={signOut}>Sign out</button>
    </main>
  );
}
