export type UserRole = "customer" | "rider" | "business" | "admin";

export type VehicleType = "bike" | "car" | "van";

export type DeliverySpeed = "standard" | "same_day" | "express" | "priority" | "scheduled" | "interstate";

export type DeliveryStatus =
  | "draft"
  | "quoted"
  | "pending_payment"
  | "searching"
  | "accepted"
  | "rider_arrived"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled";

export type RiderApplicationStatus =
  | "pending_review"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "more_info_required";

export type WalletType = "customer" | "rider" | "platform";

export type TransactionType =
  | "wallet_funding"
  | "delivery_payment"
  | "rider_earning"
  | "withdrawal"
  | "refund"
  | "commission";

export interface FareInput {
  pickup: string;
  dropoff: string;
  vehicle: VehicleType;
  speed: DeliverySpeed;
  scheduledAt?: string;
  zone?: string;
}

export interface FareEstimate {
  distanceKm: number;
  etaMinutes: number;
  baseFare: number;
  distanceFare: number;
  speedMultiplier: number;
  platformFee: number;
  total: number;
  currency: "NGN";
}

export interface DeliveryDraft {
  pickupAddress: string;
  dropoffAddress: string;
  pickupContact?: string;
  dropoffContact?: string;
  parcelType: string;
  vehicleType: VehicleType;
  deliverySpeed: DeliverySpeed;
  paymentMethod: "card" | "wallet" | "transfer";
  scheduledAt?: string;
}

export interface RiderCandidate {
  id: string;
  fullName: string;
  vehicleType: VehicleType;
  zone: string;
  distanceKm: number;
  online: boolean;
  acceptanceRate: number;
  rating: number;
  deliveryRadiusKm: number;
}

export interface MatchScore {
  riderId: string;
  score: number;
  etaMinutes: number;
  reasons: string[];
}

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  channel: "in_app" | "push" | "email";
  type:
    | "order_accepted"
    | "rider_arrived"
    | "delivery_completed"
    | "withdrawal_approved"
    | "rider_application"
    | "promotion";
  metadata?: Record<string, string | number | boolean>;
}
