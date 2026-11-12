export const automationPostStatuses = ["draft", "reviewed", "approved", "scheduled", "processing", "published", "rejected", "failed", "cancelled"] as const;
export type AutomationPostStatus = (typeof automationPostStatuses)[number];

const transitions: Record<AutomationPostStatus, readonly AutomationPostStatus[]> = {
  draft: ["reviewed", "cancelled"], reviewed: ["approved", "rejected", "draft", "cancelled"], approved: ["scheduled", "cancelled", "draft"],
  scheduled: ["processing", "cancelled", "draft"], processing: ["published", "failed", "scheduled"], published: [],
  rejected: ["draft", "cancelled"], failed: ["scheduled", "cancelled", "draft"], cancelled: []
};

export function canTransitionPost(from: AutomationPostStatus, to: AutomationPostStatus) { return transitions[from].includes(to); }
export function immutableApprovalSnapshot(content: unknown) { return JSON.parse(JSON.stringify(content ?? {})); }
