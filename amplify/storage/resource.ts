// amplify/storage/resource.ts
import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "appStorage",
  access: (allow) => ({
    // videos under this prefix
    "milestone-updates/*": [
      // only signed-in users can read/write
      allow.authenticated().to(["read", "write"]),
    ],
  }),
});
