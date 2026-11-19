// Approved, non-operational company knowledge. This module is deliberately
// static: customer-facing questions never need database access or analytics.
export type CompanyKnowledgeIntent = "company_info" | "customer_support" | "delivery_request" | "vendor_enquiry" | "rider_enquiry";

export function companyKnowledgeIntentFor(message: string): CompanyKnowledgeIntent | null {
  const lower = message.toLowerCase();
  const routes: Array<[CompanyKnowledgeIntent, RegExp]> = [
    ["delivery_request", /send (a )?package|book (a )?delivery|deliver.*(?:to|in)\s+lagos|package.*(?:to|in)\s+lagos/],
    ["rider_enquiry", /become (a )?(delivery |rider |cyclist )?partner|become (a )?rider|rider (application|signup|sign up)|cyclist (application|signup|sign up)/],
    ["vendor_enquiry", /register (my |a )?(restaurant|vendor|business)|restaurant (registration|onboarding)|become (a )?vendor|vendor (application|signup|sign up)/],
    ["customer_support", /\b(help|support|track|where is my|order status|customer service|damaged|damage|missing package)\b/],
    ["company_info", /what services|what do you offer|tell me about fast fleets|about fast fleets|fast fleets 360 (services|offer)|do you offer.*dispatch/]
  ];
  return routes.find(([, expression]) => expression.test(lower))?.[0] || null;
}

const services = "Fast Fleets 360 provides dispatch and package delivery; a restaurant marketplace with food delivery; shopping for groceries, medicine, fashion, electronics and gadgets; FastErrand; storage facilities; and heavy logistics. Our operational services also include FastConfirm™ and Secure Hand-Off, alongside vendor and cyclist operations.";

export function approvedCompanyKnowledge(intent: CompanyKnowledgeIntent) {
  if (intent === "delivery_request") return "To send a package in Lagos, use Fast Fleets 360 to arrange dispatch and package delivery. Provide the pickup location, destination, package details and recipient contact information in the customer booking flow. Availability, pricing and a rider assignment are confirmed there; FAST AI cannot create or change a delivery.";
  if (intent === "rider_enquiry") return "To become a Fast Fleets delivery partner, apply through the rider or cyclist onboarding process. Prepare your valid identification, contact details, required vehicle or bicycle information and any documents requested during verification. Approval, onboarding and rider assignment are handled by the authorised operations workflow; FAST AI cannot approve an application.";
  if (intent === "vendor_enquiry") return "Restaurants and other vendors can register through the Fast Fleets vendor onboarding process. Provide your business details, contact information, service location, catalogue or menu, and any requested verification documents. The authorised vendor team reviews applications; FAST AI cannot register or approve a business.";
  if (intent === "customer_support") return "Fast Fleets 360 can help with dispatch and package delivery, restaurant food delivery, shopping and FastErrand requests. For a specific booking, use the relevant customer flow or support channel with your order or delivery details. FAST AI can explain available services but cannot place, alter or cancel an order.";
  return services;
}
