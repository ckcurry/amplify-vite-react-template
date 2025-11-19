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

      videoUrl: a.string().required(),        // storage path
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

  HouseholdTask: a
    .model({
      id: a.id().required(),
      householdId: a.string().required(),
      content: a.string().required(),
      completed: a.boolean().required(),
      scheduledFor: a.date().required(),

      // 1) enum with NO default here – just the enum values:
      recurrence: a.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]),

      // 2) optional end date: use nullable() instead of .optional()
      recurrenceEndDate: a.date().nullable(),
    })
    .authorization((allow) => [allow.owner()]),


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

      // 🔹 NEW: each household project has many milestones
      milestones: a.hasMany("HouseholdMilestone", "projectId"),
    })
    .authorization((allow) => [allow.authenticated()]),

  // 🔹 NEW: household project milestones
  HouseholdMilestone: a
    .model({
      title: a.string().required(),

      projectId: a.id().required(),
      project: a.belongsTo("HouseholdProject", "projectId"),

      dueDate: a.date(),
      completed: a.boolean().default(false),

      // each milestone can have many updates
      updates: a.hasMany("HouseholdMilestoneUpdate", "milestoneId"),
    })
    .authorization((allow) => [allow.authenticated()]),

  // 🔹 NEW: household milestone updates (with video, like your main app)
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
    // ⭐ Use the signed-in user (Cognito user pool) by default
    defaultAuthorizationMode: "userPool",
    // If you no longer need public API access, you can remove the apiKey block completely.
    // If you DO need an API key for something else, leave it but it won't apply to these
    // models because they only allow owner().
    // apiKeyAuthorizationMode: {
    //   expiresInDays: 30,
    // },
  },
});
