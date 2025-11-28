import { useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

const INTEREST_OPTIONS = [
  { name: "AI & ML", group: "Intellectual" },
  { name: "Web Development", group: "Intellectual" },
  { name: "Mobile Apps", group: "Intellectual" },
  { name: "DevOps", group: "Intellectual" },
  { name: "Startups", group: "Intellectual" },
  { name: "Finance", group: "Intellectual" },
  { name: "Design", group: "Intellectual" },
  { name: "Photography", group: "Intellectual" },

  { name: "Gaming", group: "Activity" },
  { name: "Travel", group: "Activity" },

  { name: "Fitness", group: "Health" },
  { name: "Cooking", group: "Health" },

  { name: "Music", group: "Spiritual" },
  { name: "Film & TV", group: "Spiritual" },
  { name: "Parenting", group: "Spiritual" },
];

type WithOwner = { owner?: string; createdBy?: string };

export function CommunityPage() {
  const [interests, setInterests] = useState<Array<Schema["Interest"]["type"]>>(
    []
  );
  const [userInterests, setUserInterests] = useState<
    Array<Schema["UserInterest"]["type"]>
  >([]);
  const [questions, setQuestions] = useState<
    Array<Schema["Question"]["type"]>
  >([]);
  const [answers, setAnswers] = useState<Array<Schema["Answer"]["type"]>>([]);
  const [upvotes, setUpvotes] = useState<
    Array<Schema["AnswerUpvote"]["type"]>
  >([]);

  const [search, setSearch] = useState("");
  const [newQuestionByInterest, setNewQuestionByInterest] = useState<
    Record<string, string>
  >({});
  const [newAnswerByQuestion, setNewAnswerByQuestion] = useState<
    Record<string, string>
  >({});

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((u) => {
        if (!cancelled) setCurrentUserId(u.userId);
      })
      .catch((err) => {
        console.error("Failed to load current user", err);
        if (!cancelled) setCurrentUserId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interestSub = client.models.Interest.observeQuery().subscribe({
      next: (data: any) => setInterests([...data.items]),
    });
    const userInterestSub = client.models.UserInterest.observeQuery().subscribe({
      next: (data: any) => setUserInterests([...data.items]),
    });
    const questionSub = client.models.Question.observeQuery().subscribe({
      next: (data: any) => setQuestions([...data.items]),
    });
    const answerSub = client.models.Answer.observeQuery().subscribe({
      next: (data: any) => setAnswers([...data.items]),
    });
    const upvoteSub = client.models.AnswerUpvote.observeQuery().subscribe({
      next: (data: any) => setUpvotes([...data.items]),
    });

    return () => {
      interestSub.unsubscribe();
      userInterestSub.unsubscribe();
      questionSub.unsubscribe();
      answerSub.unsubscribe();
      upvoteSub.unsubscribe();
    };
  }, []);

  const interestByName = useMemo(() => {
    const map = new Map<string, Schema["Interest"]["type"]>();
    for (const i of interests) map.set(i.name, i);
    return map;
  }, [interests]);

  const userInterestIds = useMemo(
    () => new Set(userInterests.map((ui) => ui.interestId)),
    [userInterests]
  );

  const availableInterests = INTEREST_OPTIONS.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  async function ensureInterest(name: string) {
    const existing = interestByName.get(name);
    if (existing) return existing.id;
    const { data } = await client.models.Interest.create({ name });
    return data?.id;
  }

  async function handleSelectInterest(name: string) {
    const interestId = await ensureInterest(name);
    if (!interestId) return;
    if (userInterestIds.has(interestId)) return;
    await client.models.UserInterest.create({ interestId });
  }

  const selectedInterests = interests.filter((i) =>
    userInterestIds.has(i.id)
  );

  function questionsForInterest(interestId: string) {
    return questions
      .filter((q) => q.interestId === interestId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  function answersForQuestion(questionId: string) {
    return answers
      .filter((a) => a.questionId === questionId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  function upvoteCount(questionId: string) {
    return upvotes.filter((u) => u.questionId === questionId).length;
  }

  function userHasUpvoted(questionId: string) {
    if (!currentUserId) return false;
    return upvotes.some(
      (u) =>
        u.questionId === questionId &&
        ((u as unknown as WithOwner).owner === currentUserId ||
          (u as unknown as WithOwner).createdBy === currentUserId)
    );
  }

  function userAnswered(questionId: string) {
    if (!currentUserId) return false;
    return answers.some(
      (a) =>
        a.questionId === questionId &&
        ((a as unknown as WithOwner).owner === currentUserId ||
          (a as unknown as WithOwner).createdBy === currentUserId)
    );
  }

  function canViewAnswers(questionId: string) {
    return userHasUpvoted(questionId) || userAnswered(questionId);
  }

  async function handlePostQuestion(interestId: string) {
    const content = (newQuestionByInterest[interestId] || "").trim();
    if (!content) return;
    await client.models.Question.create({ interestId, content });
    setNewQuestionByInterest((prev) => ({ ...prev, [interestId]: "" }));
  }

  async function handlePostAnswer(questionId: string) {
    const content = (newAnswerByQuestion[questionId] || "").trim();
    if (!content) return;
    await client.models.Answer.create({ questionId, content });
    setNewAnswerByQuestion((prev) => ({ ...prev, [questionId]: "" }));
  }

  async function handleUpvote(questionId: string) {
    if (userHasUpvoted(questionId)) return;
    await client.models.AnswerUpvote.create({ questionId });
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
      <h1>Community</h1>
      <p>
        Pick your interests to join groups. Ask questions, answer them, and
        upvote to unlock answers without posting.
      </p>

      <section style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
        <h2>Select interests</h2>
        <input
          type="text"
          placeholder="Search interests"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", maxWidth: "400px", marginBottom: "0.75rem" }}
        />
        {["Intellectual", "Activity", "Health", "Spiritual"].map((group) => {
          const groupItems = availableInterests.filter(
            (opt) => opt.group === group
          );
          if (groupItems.length === 0) return null;
          return (
            <div key={group} style={{ marginBottom: "0.75rem" }}>
              <h4 style={{ margin: "0 0 0.35rem" }}>{group}</h4>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                {groupItems.map((opt) => (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => handleSelectInterest(opt.name)}
                    disabled={
                      userInterestIds.has(interestByName.get(opt.name)?.id || "")
                    }
                  >
                    {opt.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <h2>Your groups</h2>
        {selectedInterests.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            Pick at least one interest to join a group.
          </p>
        ) : (
          selectedInterests.map((interest) => {
            const qs = questionsForInterest(interest.id);
            return (
              <div
                key={interest.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  marginBottom: "1rem",
                  background: "white",
                }}
              >
                <h3 style={{ marginTop: 0 }}>{interest.name}</h3>

                <div style={{ marginBottom: "0.75rem" }}>
                  <input
                    type="text"
                    placeholder="Ask a question"
                    value={newQuestionByInterest[interest.id] || ""}
                    onChange={(e) =>
                      setNewQuestionByInterest((prev) => ({
                        ...prev,
                        [interest.id]: e.target.value,
                      }))
                    }
                    style={{ width: "100%", maxWidth: "520px", marginRight: "0.5rem" }}
                  />
                  <button onClick={() => handlePostQuestion(interest.id)}>
                    Post
                  </button>
                </div>

                {qs.length === 0 ? (
                  <p style={{ color: "#888", fontStyle: "italic" }}>
                    No questions yet.
                  </p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {qs.map((q) => {
                      const canSee = canViewAnswers(q.id);
                      const theseAnswers = canSee ? answersForQuestion(q.id) : [];
                      return (
                        <li
                          key={q.id}
                          style={{
                            borderTop: "1px solid #eee",
                            padding: "0.75rem 0",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              justifyContent: "space-between",
                              gap: "0.5rem",
                              alignItems: "center",
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{q.content}</div>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button onClick={() => handleUpvote(q.id)}>
                                Upvote ({upvoteCount(q.id)})
                              </button>
                            </div>
                          </div>

                          <div style={{ marginTop: "0.5rem" }}>
                            <input
                              type="text"
                              placeholder={
                                canSee
                                  ? "Write an answer"
                                  : "Upvote to unlock answers"
                              }
                              value={newAnswerByQuestion[q.id] || ""}
                              onChange={(e) =>
                                setNewAnswerByQuestion((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              disabled={!canSee}
                              style={{
                                width: "100%",
                                maxWidth: "520px",
                                marginRight: "0.5rem",
                              }}
                            />
                            <button
                              onClick={() => handlePostAnswer(q.id)}
                              disabled={!canSee}
                            >
                              Answer
                            </button>
                          </div>

                          {canSee ? (
                            theseAnswers.length === 0 ? (
                              <div
                                style={{ color: "#888", fontStyle: "italic", marginTop: "0.35rem" }}
                              >
                                No answers yet.
                              </div>
                            ) : (
                              <ul
                                style={{
                                  marginTop: "0.5rem",
                                  paddingLeft: "1rem",
                                  color: "#111",
                                }}
                              >
                                {theseAnswers.map((a) => (
                                  <li key={a.id} style={{ marginBottom: "0.35rem" }}>
                                    {a.content}
                                  </li>
                                ))}
                              </ul>
                            )
                          ) : (
                            <div
                              style={{
                                marginTop: "0.35rem",
                                color: "#888",
                                fontStyle: "italic",
                              }}
                            >
                              Upvote this question to view answers without posting.
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
