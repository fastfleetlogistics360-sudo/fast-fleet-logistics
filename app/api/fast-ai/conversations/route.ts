import { NextRequest, NextResponse } from "next/server";
import { listCustomerConversations, loadCustomerConversation } from "@/lib/automation/customer-conversation-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your saved FAST AI conversations." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Saved conversations are unavailable right now." }, { status: 503 });
  try {
    const conversationId = request.nextUrl.searchParams.get("id");
    if (conversationId) {
      const conversation = await loadCustomerConversation(db, user.id, conversationId);
      if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      return NextResponse.json({ conversation }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ conversations: await listCustomerConversations(db, user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Saved conversations are unavailable right now." }, { status: 503 });
  }
}
