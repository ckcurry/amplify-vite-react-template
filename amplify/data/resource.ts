// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  // Simple personal todo items
  Todo: a
    .model({
      content: a.string(),
    })
    // ⭐ Only the owner can read/write their todos
    .authorization((allow) => [allow.owner()]),

  // Projects belong to the signed-in user
  Project: a
    .model({
      name: a.string().required(),
      milestones: a.hasMany("Milestone", "projectId"),
    })
    .authorization((allow) => [allow.owner()]),

  // Each project has many milestones; still owned by the same user
  Milestone: a
    .model({
      title: a.string().required(),
      projectId: a.id().required(),
      project: a.belongsTo("Project", "projectId"),
      dueDate: a.date(),
      completed: a.boolean(),
      updates: a.hasMany("MilestoneUpdate", "milestoneId"),
    })
    .authorization((allow) => [allow.owner()]),

  // Each milestone can have many video updates
  MilestoneUpdate: a
    .model({
      milestoneId: a.id().required(),
      milestone: a.belongsTo("Milestone", "milestoneId"),

      videoUrl: a.string().required(), // storage path
      durationSeconds: a.integer().required(),
      note: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  Household: a
    .model({
      name: a.string().required(),

      // back-references for relationships
      memberships: a.hasMany("HouseholdMembership", "householdId"),
      projects: a.hasMany("HouseholdProject", "householdId"),
      tasks: a.hasMany("HouseholdTask", "householdId"),
    })
    .authorization((allow) => [allow.authenticated()]),

  ActiveTaskSlot: a
    .model({
      slotIndex: a.integer().required(),
      source: a.enum(["TODO", "HOUSEHOLD"]),
      taskId: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),

  HouseholdTask: a
    .model({
      // id is fine to keep explicit, but Amplify will also add one automatically
      id: a.id().required(),

      // IMPORTANT: this must be an id() and have a belongsTo
      householdId: a.id().required(),
      household: a.belongsTo("Household", "householdId"),

      content: a.string().required(),
      completed: a.boolean().required(),
      scheduledFor: a.date().required(),

      // recurrence info
      recurrence: a.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]),
      recurrenceEndDate: a.date(),

      // who claimed this task (optional)
      claimedByUserId: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  HouseholdMembership: a
    .model({
      householdId: a.id().required(),
      household: a.belongsTo("Household", "householdId"),
    })
    .authorization((allow) => [allow.owner()]),

  HouseholdProject: a
    .model({
      householdId: a.id().required(),
      household: a.belongsTo("Household", "householdId"),

      name: a.string().required(),

      // each household project has many milestones
      milestones: a.hasMany("HouseholdMilestone", "projectId"),
    })
    .authorization((allow) => [allow.authenticated()]),

  HouseholdMilestone: a
    .model({
      title: a.string().required(),

      projectId: a.id().required(),
      project: a.belongsTo("HouseholdProject", "projectId"),

      dueDate: a.date(),
      completed: a.boolean().default(false),

      updates: a.hasMany("HouseholdMilestoneUpdate", "milestoneId"),
    })
    .authorization((allow) => [allow.authenticated()]),

  HouseholdMilestoneUpdate: a
    .model({
      milestoneId: a.id().required(),
      milestone: a.belongsTo("HouseholdMilestone", "milestoneId"),

      videoUrl: a.string().required(),
      durationSeconds: a.integer().required(),
      note: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
