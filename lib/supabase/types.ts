import type { DeliverySpeed, DeliveryStatus, RiderApplicationStatus, UserRole, VehicleType, WalletType } from "@/types/domain";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          role: UserRole;
          account_type?: string;
          avatar_url: string | null;
          default_zone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          default_zone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          account_type: UserRole;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      business_profiles: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          contact_name: string | null;
          phone: string | null;
          email: string | null;
          industry: string | null;
          business_type: string | null;
          commission_rate: number | null;
          dispatch_volume: string | null;
          pickup_address: string | null;
          cac_number: string | null;
          registration_status: "submitted" | "active" | "paused" | "rejected";
          rejection_reason: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["business_profiles"]["Row"]> & {
          user_id: string;
          business_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["business_profiles"]["Row"]>;
      };
      business_documents: {
        Row: {
          id: string;
          business_profile_id: string;
          user_id: string;
          document_type: "storefront_photo" | "cac_certificate" | "director_government_id" | "address_proof";
          file_url: string | null;
          storage_path: string | null;
          status: "submitted" | "approved" | "rejected";
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["business_documents"]["Row"]> & {
          business_profile_id: string;
          user_id: string;
          document_type: "storefront_photo" | "cac_certificate" | "director_government_id" | "address_proof";
        };
        Update: Partial<Database["public"]["Tables"]["business_documents"]["Row"]>;
      };
      rider_profiles: {
        Row: {
          id: string;
          user_id: string;
          application_status: RiderApplicationStatus;
          vehicle_type: VehicleType | null;
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_year: number | null;
          plate_number: string | null;
          vehicle_color: string | null;
          operating_zone: string | null;
          bank_name: string | null;
          bank_code: string | null;
          account_number: string | null;
          account_name: string | null;
          rating: number;
          acceptance_rate: number;
          level: "Bronze" | "Silver" | "Gold" | "Elite";
          online: boolean;
          suspended_at: string | null;
          suspension_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rider_profiles"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["rider_profiles"]["Row"]>;
      };
      deliveries: {
        Row: {
          id: string;
          delivery_code: string;
          customer_id: string;
          rider_id: string | null;
          pickup_address: string;
          pickup_contact: string | null;
          pickup_latitude: number | null;
          pickup_longitude: number | null;
          dropoff_address: string;
          dropoff_contact: string | null;
          dropoff_latitude: number | null;
          dropoff_longitude: number | null;
          parcel_type: string;
          vehicle_type: VehicleType;
          delivery_speed: DeliverySpeed;
          payment_method: "card" | "wallet" | "transfer";
          status: DeliveryStatus;
          price_ngn: number;
          distance_km: number;
          eta_minutes: number;
          scheduled_at: string | null;
          accepted_at: string | null;
          picked_up_at: string | null;
          delivered_at: string | null;
          proof_url: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["deliveries"]["Row"]> & {
          customer_id: string;
          pickup_address: string;
          dropoff_address: string;
          parcel_type: string;
          vehicle_type: VehicleType;
          delivery_speed: DeliverySpeed;
        };
        Update: Partial<Database["public"]["Tables"]["deliveries"]["Row"]>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          type: string;
          channel: string;
          read_at: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> & {
          user_id: string;
          title: string;
          body: string;
          type: string;
          channel: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
      };
      rider_documents: {
        Row: {
          id: string;
          rider_profile_id: string;
          document_type: string;
          file_url: string | null;
          storage_path: string | null;
          status: "submitted" | "approved" | "rejected" | "more_info_required";
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rider_documents"]["Row"]> & {
          rider_profile_id: string;
          document_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["rider_documents"]["Row"]>;
      };
      rider_applications: {
        Row: {
          id: string;
          user_id: string;
          status: "pending_review" | "under_review" | "approved" | "rejected" | "more_info_required";
          full_name: string;
          phone: string;
          email: string;
          lga: string;
          vehicle_type: "motorcycle" | "tricycle" | "car" | "van";
          vehicle_make: string;
          vehicle_model: string;
          vehicle_year: number;
          plate_number: string;
          vehicle_color: string;
          government_id_type: "nin_slip" | "voters_card" | "drivers_licence" | "passport";
          bank_name: string;
          bank_code: string;
          account_number: string;
          account_name: string;
          documents: Json;
          agreement_accepted_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rider_applications"]["Row"]> & {
          user_id: string;
          full_name: string;
          phone: string;
          email: string;
          lga: string;
          vehicle_type: "motorcycle" | "tricycle" | "car" | "van";
          vehicle_make: string;
          vehicle_model: string;
          vehicle_year: number;
          plate_number: string;
          vehicle_color: string;
          government_id_type: "nin_slip" | "voters_card" | "drivers_licence" | "passport";
          bank_name: string;
          bank_code: string;
          account_number: string;
          account_name: string;
          agreement_accepted_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["rider_applications"]["Row"]>;
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          keys: Json;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]> & {
          user_id: string;
          endpoint: string;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]>;
      };
      wallets: {
        Row: {
          id: string;
          user_id: string;
          wallet_type: WalletType;
          balance_ngn: number;
          locked_balance_ngn: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["wallets"]["Row"]> & {
          user_id: string;
          wallet_type: WalletType;
        };
        Update: Partial<Database["public"]["Tables"]["wallets"]["Row"]>;
      };
      transactions: {
        Row: {
          id: string;
          wallet_id: string;
          delivery_id: string | null;
          transaction_type: string;
          amount_ngn: number;
          status: string;
          provider: string | null;
          provider_reference: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["transactions"]["Row"]> & {
          wallet_id: string;
          transaction_type: string;
          amount_ngn: number;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Row"]>;
      };
      company_transaction_logs: {
        Row: {
          id: string;
          entry_date: string;
          category:
            | "vehicle_maintenance"
            | "site_maintenance"
            | "delivery_income"
            | "fuel"
            | "payroll"
            | "rider_payout"
            | "office_expense"
            | "software"
            | "tax"
            | "insurance"
            | "licensing_permits"
            | "rent_utilities"
            | "marketing"
            | "customer_refund"
            | "supplier_payment"
            | "asset_purchase"
            | "other";
          direction: "income" | "expense" | "transfer";
          amount_ngn: number;
          title: string;
          counterparty: string | null;
          reference: string | null;
          payment_method: string | null;
          status: "pending" | "cleared" | "flagged";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["company_transaction_logs"]["Row"]> & {
          entry_date: string;
          category: Database["public"]["Tables"]["company_transaction_logs"]["Row"]["category"];
          direction: Database["public"]["Tables"]["company_transaction_logs"]["Row"]["direction"];
          amount_ngn: number;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_transaction_logs"]["Row"]>;
      };
      withdrawal_requests: {
        Row: {
          id: string;
          rider_profile_id: string;
          amount_ngn: number;
          bank_name: string;
          account_number: string;
          account_name: string | null;
          status: "pending" | "approved" | "rejected" | "paid";
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["withdrawal_requests"]["Row"]> & {
          rider_profile_id: string;
          amount_ngn: number;
          bank_name: string;
          account_number: string;
        };
        Update: Partial<Database["public"]["Tables"]["withdrawal_requests"]["Row"]>;
      };
      platform_launch_states: {
        Row: {
          id: string;
          state: string;
          status: "active" | "live" | "beta" | "waitlist" | "paused";
          launched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["platform_launch_states"]["Row"]> & {
          state: string;
        };
        Update: Partial<Database["public"]["Tables"]["platform_launch_states"]["Row"]>;
      };
      state_waitlist: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          phone: string | null;
          state: string;
          source: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["state_waitlist"]["Row"]> & {
          email: string;
          state: string;
        };
        Update: Partial<Database["public"]["Tables"]["state_waitlist"]["Row"]>;
      };
      rider_locations: {
        Row: {
          rider_profile_id: string;
          zone: string | null;
          latitude: number;
          longitude: number;
          heading: number | null;
          speed: number | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rider_locations"]["Row"]> & {
          rider_profile_id: string;
          latitude: number;
          longitude: number;
        };
        Update: Partial<Database["public"]["Tables"]["rider_locations"]["Row"]>;
      };
      delivery_locations: {
        Row: {
          id: string;
          order_id: string;
          rider_id: string;
          latitude: number;
          longitude: number;
          heading: number | null;
          speed: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["delivery_locations"]["Row"]> & {
          order_id: string;
          rider_id: string;
          latitude: number;
          longitude: number;
        };
        Update: Partial<Database["public"]["Tables"]["delivery_locations"]["Row"]>;
      };
      platform_settings: {
        Row: {
          key: string;
          value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["platform_settings"]["Row"]> & {
          key: string;
          value: Json;
        };
        Update: Partial<Database["public"]["Tables"]["platform_settings"]["Row"]>;
      };
      support_tickets: {
        Row: {
          id: string;
          user_id: string | null;
          delivery_id: string | null;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          topic: string;
          subject: string | null;
          message: string;
          priority: "low" | "normal" | "high" | "urgent";
          status: "open" | "in_progress" | "resolved" | "closed";
          assigned_admin_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["support_tickets"]["Row"]> & {
          topic: string;
          message: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_tickets"]["Row"]>;
      };
      support_messages: {
        Row: {
          id: string;
          ticket_id: string;
          sender_type: "customer" | "admin" | "bot";
          sender_user_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["support_messages"]["Row"]> & {
          ticket_id: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_messages"]["Row"]>;
      };
      fraud_signals: {
        Row: {
          id: string;
          user_id: string | null;
          delivery_id: string | null;
          signal_type: string;
          risk_score: number;
          details: Json;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fraud_signals"]["Row"]> & {
          signal_type: string;
          risk_score: number;
        };
        Update: Partial<Database["public"]["Tables"]["fraud_signals"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_wallet_funding: {
        Args: {
          next_user_id: string;
          next_wallet_type: WalletType;
          next_amount_ngn: number;
          next_provider: string;
          next_provider_reference: string;
          next_metadata?: Json;
        };
        Returns: string;
      };
      complete_wallet_funding: {
        Args: {
          next_provider_reference: string;
          next_amount_ngn: number;
          next_metadata?: Json;
        };
        Returns: string;
      };
      mark_wallet_funding_failed: {
        Args: {
          next_provider_reference: string;
          next_metadata?: Json;
        };
        Returns: string;
      };
      pay_delivery_from_wallet: {
        Args: {
          target_delivery_id: string;
          next_metadata?: Json;
        };
        Returns: string;
      };
      create_withdrawal_request: {
        Args: {
          target_rider_profile_id: string;
          next_amount_ngn: number;
        };
        Returns: string;
      };
      review_withdrawal_request: {
        Args: {
          request_id: string;
          next_status: string;
          rejection_note?: string | null;
        };
        Returns: string;
      };
      assign_next_delivery_to_rider: {
        Args: {
          target_rider_profile_id: string;
        };
        Returns: string | null;
      };
      accept_delivery_offer: {
        Args: {
          target_delivery_id: string;
        };
        Returns: string;
      };
      reject_delivery_offer: {
        Args: {
          target_delivery_id: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
