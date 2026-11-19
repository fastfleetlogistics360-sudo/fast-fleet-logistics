# FAST AI Phase 2C — Groq provider

Phase 2C optionally adds a server-side Groq language-provider adapter to the internal FAST AI Command Centre. It does not add customer chat, automation, publishing, payments, SQL execution, database write tools, or external operational actions.

## Configuration

Set these values only in the server environment (for example, Vercel project environment variables). Never use a `NEXT_PUBLIC_` prefix and never place the key in the Android/iOS build, browser, source control, database, or logs.

```text
FAST_AI_PROVIDER=groq
FAST_AI_MODEL=<a model enabled for this Groq account>
GROQ_API_KEY=<server-side Groq API key>
```

Leave `FAST_AI_PROVIDER=deterministic` (or omit it) to disable all provider calls. The model value must be one available to the configured Groq account; Phase 2C makes no claim about a specific model being enabled.

## Data and safety boundary

The application first authorises the administrator, rate-limits the request, and collects the existing Phase 2A aggregate intelligence. Only a bounded aggregate brief, the user’s bounded question, and the deterministic verified response are sent to Groq. The adapter never receives a Supabase client, SQL, credentials, raw user records, rider contact details, payment data, KYC information, or tools.

Financial intelligence is collected only when the existing server-side permission is `super_admin` and the user explicitly requests financial information. Unauthorised financial questions do not invoke Groq.

Groq runs through the official OpenAI-compatible server endpoint with a 12-second timeout. Missing configuration, timeout, network/provider errors, HTTP 429 rate limits, malformed JSON, or an unsafe/empty provider response all return the pre-existing deterministic answer instead. The UI labels each returned answer as `Groq generated` or `Deterministic fallback`; audit logs record only the provider, model identifier, response mode, actor, category, tools, and latency.

## Validation

Run locally without contacting Groq:

```bash
node --experimental-strip-types --test tests/fast-ai-phase2c-groq.test.ts
npm run typecheck
```

The provider test injects a mocked request function. It does not use a real API key or perform a network request.
