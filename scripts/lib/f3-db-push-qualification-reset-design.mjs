/**
 * F13 qualification-reset DESIGN validators (Phase 1).
 *
 * LOCAL / OFFLINE ONLY. Fail-closed planner stubs.
 * Does not connect, apply SQL, open a mutation entrypoint, or weaken
 * --wipe-to-baseline rejection.
 *
 * Label: F13 RESET DESIGN CORRECTED — AWAITING INDEPENDENT QA — NOT IMPLEMENTED YET
 */
import { createHash } from "node:crypto";
import {
  APPROVED_DISPOSABLE_HOST,
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_POOLER_HOST,
  APPROVED_DISPOSABLE_POOLER_PORT,
  APPROVED_DISPOSABLE_POOLER_USER,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  CLI_PIN,
  F3_FORWARD_FILES,
  PREASSIGNED_NAMES,
  PREASSIGNED_VERSIONS,
  PRODUCTION_REF,
  TRANSACTION_POOLER_PORT,
} from "./f3-db-push-pins.mjs";

export const F13_DESIGN_LABEL =
  "F13 RESET DESIGN CORRECTED — AWAITING INDEPENDENT QA — NOT IMPLEMENTED YET";
export const F13_DESIGN_STATUS = "PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE";
export const F13_WIPE_REJECTION_CODE = "F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH";
export const F13_MUTATION_ENTRYPOINT_OPEN = false;
export const F13_PHASE = 1;

export const F13_SUPPORTED_INTERFACE = Object.freeze({
  phase: 1,
  mutationEntrypointOpen: false,
  phase2Entrypoint: "scripts/qualify-f3-db-push-disposable.mjs",
  phase2PlannerModule: "scripts/lib/f3-db-push-qualification-reset.mjs",
  phase1DesignModule: "scripts/lib/f3-db-push-qualification-reset-design.mjs",
  phase1Tests: "scripts/test-f3-qualification-reset-design.mjs",
  wipeFlag: "--wipe-to-baseline",
  wipeFlagStatus: "unconditionally rejected",
  proposedPhase2Flag: "--qualification-reset",
  proposedPhase2AuthArtifactFlag: "--founder-authorization-artifact",
  flagAloneIsNotAuthorization: true,
  transport: "gated psql -X -v ON_ERROR_STOP=1 -f <generated-allowlist-sql>",
  transportForbidden: Object.freeze([
    "Management API apply",
    "transaction pooler :6543",
    "--wipe-to-baseline",
    "buildWipeSql DROP SCHEMA",
    "unbounded CASCADE",
  ]),
});

export const AUTHENTICATED_HISTORY_KEYS = Object.freeze(
  F3_FORWARD_FILES.map((file) => Object.freeze({
    file,
    version: PREASSIGNED_VERSIONS[file],
    name: PREASSIGNED_NAMES[file],
    provenance: "F12 functional tip PREASSIGNED_VERSIONS+PREASSIGNED_NAMES @ 1ec0e4da782ed7715a543be23f79bc0f10a28af2",
  })),
);

export const NULL_OR_EMPTY_NAME_PROVENANCE = Object.freeze({
  authenticated: false,
  finiteScopeEntries: Object.freeze([]),
  rule: "Reject null/empty history names unless authenticated provenance exists in this finite scope. None is recorded.",
});

function obj({
  id,
  kind,
  schema,
  identity,
  signature = null,
  provenance,
  requiredStartingState,
  intendedAction,
  permittedDependentEffects,
  dropOrder,
}) {
  return Object.freeze({
    id,
    kind,
    schema,
    identity,
    signature,
    provenance,
    requiredStartingState,
    intendedAction,
    permittedDependentEffects: Object.freeze([...(permittedDependentEffects || [])]),
    dropOrder,
  });
}

const P118 = "supabase/migrations/00118_f3_bounded_financial_epoch_foundation.sql @ F12 tip 1ec0e4da782ed7715a543be23f79bc0f10a28af2";
const P119 = "supabase/migrations/00119_f3_01_core_ledger_foundation.sql @ F12 tip 1ec0e4da782ed7715a543be23f79bc0f10a28af2";
const P120 = "supabase/migrations/00120_f3_02_secure_posting_idempotency.sql @ F12 tip 1ec0e4da782ed7715a543be23f79bc0f10a28af2";
const P121 = "supabase/migrations/00121_f3_03_projection_read_proof.sql @ F12 tip 1ec0e4da782ed7715a543be23f79bc0f10a28af2";
const P122 = "supabase/migrations/00122_f3_04_correction_reversal.sql @ F12 tip 1ec0e4da782ed7715a543be23f79bc0f10a28af2";
const P123 = "supabase/migrations/00123_f3_05_opening_cash_command.sql @ F12 tip 1ec0e4da782ed7715a543be23f79bc0f10a28af2";
const P_HIST = "F8/F9 historical qualification-reset.sql sha256 0d3de029828173d5287694e61b4ca3394c4a57e81182cade059bf88d86515011 (object identity only; SQL rejected as current procedure)";

const PRESENT_OR_ABSENT = "present matching this identity, or documented absent (IF EXISTS / 0-row is success only after identity probe)";
const DROP_FN = "DROP FUNCTION <schema-qualified identity> RESTRICT";
const DROP_TBL = "DROP TABLE <schema-qualified identity> RESTRICT";
const DROP_TYP = "DROP TYPE <schema-qualified identity> RESTRICT";
const DROP_SCH = "DROP SCHEMA <schema-qualified identity> RESTRICT after emptiness proof";
const OWNED = "owned indexes/triggers/policies/constraints on this relation (not other-object CASCADE)";

export const FINITE_OBJECT_ALLOWLIST = Object.freeze([
  obj({
    id: "fn.public.post_financial_opening_cash",
    kind: "function",
    schema: "public",
    identity: "public.post_financial_opening_cash(jsonb)",
    signature: "public.post_financial_opening_cash(jsonb)",
    provenance: P123,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 10,
  }),
  obj({
    id: "fn.public.get_financial_cashbook",
    kind: "function",
    schema: "public",
    identity: "public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)",
    signature: "public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)",
    provenance: P121,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 20,
  }),
  obj({
    id: "fn.public.get_financial_projection_bundle",
    kind: "function",
    schema: "public",
    identity: "public.get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)",
    signature: "public.get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)",
    provenance: P121,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 30,
  }),
  obj({
    id: "fn.public.post_financial_command",
    kind: "function",
    schema: "public",
    identity: "public.post_financial_command(jsonb)",
    signature: "public.post_financial_command(jsonb)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 40,
  }),
  obj({
    id: "fn.public.correct_financial_event",
    kind: "function",
    schema: "public",
    identity: "public.correct_financial_event(jsonb)",
    signature: "public.correct_financial_event(jsonb)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 50,
  }),
  obj({
    id: "fn.public.enqueue_outbound_notification",
    kind: "function",
    schema: "public",
    identity: "public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)",
    signature: "public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 60,
  }),
  obj({
    id: "fn.public.execute_member_transfer",
    kind: "function",
    schema: "public",
    identity: "public.execute_member_transfer(jsonb)",
    signature: "public.execute_member_transfer(jsonb)",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 70,
  }),
  obj({
    id: "fn.public.request_member_transfer",
    kind: "function",
    schema: "public",
    identity: "public.request_member_transfer(jsonb)",
    signature: "public.request_member_transfer(jsonb)",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 80,
  }),
  obj({
    id: "fn.public.has_group_permission",
    kind: "function",
    schema: "public",
    identity: "public.has_group_permission(uuid,text,uuid)",
    signature: "public.has_group_permission(uuid,text,uuid)",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 90,
  }),
  obj({
    id: "fn.public.compute_member_standing",
    kind: "function",
    schema: "public",
    identity: "public.compute_member_standing(uuid)",
    signature: "public.compute_member_standing(uuid)",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 100,
  }),
  obj({
    id: "fn.public.m2_is_valid_iana_timezone",
    kind: "function",
    schema: "public",
    identity: "public.m2_is_valid_iana_timezone(text)",
    signature: "public.m2_is_valid_iana_timezone(text)",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 110,
  }),
  obj({
    id: "fn.public.notification_policy_set_updated_at",
    kind: "function",
    schema: "public",
    identity: "public.notification_policy_set_updated_at()",
    signature: "public.notification_policy_set_updated_at()",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 120,
  }),
  obj({
    id: "fn.public.uuid_generate_v5",
    kind: "function",
    schema: "public",
    identity: "public.uuid_generate_v5(uuid,text)",
    signature: "public.uuid_generate_v5(uuid,text)",
    provenance: `${P_HIST}; also referenced by ${P122}`,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 130,
  }),
  obj({
    id: "fn.financial_core.post_f3_opening_cash",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.post_f3_opening_cash(jsonb)",
    signature: "financial_core.post_f3_opening_cash(jsonb)",
    provenance: P123,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 200,
  }),
  obj({
    id: "fn.financial_core.f3_opening_safe_text",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_opening_safe_text(text,integer,boolean)",
    signature: "financial_core.f3_opening_safe_text(text,integer,boolean)",
    provenance: P123,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 210,
  }),
  obj({
    id: "fn.financial_core.guard_f3_opening_provenance",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_f3_opening_provenance()",
    signature: "financial_core.guard_f3_opening_provenance()",
    provenance: P123,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 220,
  }),
  obj({
    id: "fn.financial_core.correct_f3_command",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.correct_f3_command(jsonb)",
    signature: "financial_core.correct_f3_command(jsonb)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 230,
  }),
  obj({
    id: "fn.financial_core.check_f3_correction_closure",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.check_f3_correction_closure()",
    signature: "financial_core.check_f3_correction_closure()",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 240,
  }),
  obj({
    id: "fn.financial_core.guard_f3_correction_lineage",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_f3_correction_lineage()",
    signature: "financial_core.guard_f3_correction_lineage()",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 250,
  }),
  obj({
    id: "fn.financial_core.assert_f3_correction_postings",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.assert_f3_correction_postings(uuid,jsonb)",
    signature: "financial_core.assert_f3_correction_postings(uuid,jsonb)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 260,
  }),
  obj({
    id: "fn.financial_core.resolve_f3_correction_replacement",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean)",
    signature: "financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 270,
  }),
  obj({
    id: "fn.financial_core.f3_correction_posting_json",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamp with time zone,numeric,financial_control_class,uuid,uuid,uuid,financial_category_class,uuid,uuid)",
    signature: "financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamp with time zone,numeric,financial_control_class,uuid,uuid,uuid,financial_category_class,uuid,uuid)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 280,
  }),
  obj({
    id: "fn.financial_core.f3_correction_child_id",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_correction_child_id(uuid,uuid,text)",
    signature: "financial_core.f3_correction_child_id(uuid,uuid,text)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 290,
  }),
  obj({
    id: "fn.financial_core.f3_correction_reason",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_correction_reason(jsonb)",
    signature: "financial_core.f3_correction_reason(jsonb)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 300,
  }),
  obj({
    id: "fn.financial_core.f3_correction_signed_amount",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_correction_signed_amount(numeric,text)",
    signature: "financial_core.f3_correction_signed_amount(numeric,text)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 310,
  }),
  obj({
    id: "fn.financial_core.f3_correction_timestamp",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_correction_timestamp(timestamp with time zone)",
    signature: "financial_core.f3_correction_timestamp(timestamp with time zone)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 320,
  }),
  obj({
    id: "fn.financial_core.f3_correction_fingerprint",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_correction_fingerprint(jsonb)",
    signature: "financial_core.f3_correction_fingerprint(jsonb)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 330,
  }),
  obj({
    id: "fn.financial_core.f3_correction_canonical",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_correction_canonical(jsonb)",
    signature: "financial_core.f3_correction_canonical(jsonb)",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 340,
  }),
  obj({
    id: "fn.financial_core.guard_f3_correction_payload",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_f3_correction_payload()",
    signature: "financial_core.guard_f3_correction_payload()",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 350,
  }),
  obj({
    id: "fn.financial_core.projection_cashbook_rows",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.projection_cashbook_rows(uuid,boolean)",
    signature: "financial_core.projection_cashbook_rows(uuid,boolean)",
    provenance: P121,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 360,
  }),
  obj({
    id: "fn.financial_core.format_projection_amount",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.format_projection_amount(numeric,text)",
    signature: "financial_core.format_projection_amount(numeric,text)",
    provenance: P121,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 370,
  }),
  obj({
    id: "fn.financial_core.post_f3_command",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.post_f3_command(jsonb,jsonb)",
    signature: "financial_core.post_f3_command(jsonb,jsonb)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 380,
  }),
  obj({
    id: "fn.financial_core.lock_f3_identity",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.lock_f3_identity(uuid,uuid,text,text,text)",
    signature: "financial_core.lock_f3_identity(uuid,uuid,text,text,text)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 390,
  }),
  obj({
    id: "fn.financial_core.check_f3_posting_closure",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.check_f3_posting_closure()",
    signature: "financial_core.check_f3_posting_closure()",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 400,
  }),
  obj({
    id: "fn.financial_core.guard_f3_posting_closure",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_f3_posting_closure()",
    signature: "financial_core.guard_f3_posting_closure()",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 410,
  }),
  obj({
    id: "fn.financial_core.guard_f3_payload",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_f3_payload()",
    signature: "financial_core.guard_f3_payload()",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 420,
  }),
  obj({
    id: "fn.financial_core.f3_fingerprint",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_fingerprint(jsonb)",
    signature: "financial_core.f3_fingerprint(jsonb)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 430,
  }),
  obj({
    id: "fn.financial_core.f3_canonical",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_canonical(jsonb)",
    signature: "financial_core.f3_canonical(jsonb)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 440,
  }),
  obj({
    id: "fn.financial_core.f3_trim",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_trim(text)",
    signature: "financial_core.f3_trim(text)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 450,
  }),
  obj({
    id: "fn.financial_core.f3_timestamp",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_timestamp(jsonb)",
    signature: "financial_core.f3_timestamp(jsonb)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 460,
  }),
  obj({
    id: "fn.financial_core.f3_amount",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_amount(jsonb,text)",
    signature: "financial_core.f3_amount(jsonb,text)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 470,
  }),
  obj({
    id: "fn.financial_core.f3_currency",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_currency(jsonb)",
    signature: "financial_core.f3_currency(jsonb)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 480,
  }),
  obj({
    id: "fn.financial_core.f3_uuid",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.f3_uuid(jsonb,boolean)",
    signature: "financial_core.f3_uuid(jsonb,boolean)",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 490,
  }),
  obj({
    id: "fn.financial_core.lock_financial_occurrence",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.lock_financial_occurrence(uuid,text,text,text,uuid)",
    signature: "financial_core.lock_financial_occurrence(uuid,text,text,text,uuid)",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 500,
  }),
  obj({
    id: "fn.financial_core.assert_finances_manage",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.assert_finances_manage(uuid)",
    signature: "financial_core.assert_finances_manage(uuid)",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 510,
  }),
  obj({
    id: "fn.financial_core.can_view_finances",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.can_view_finances(uuid)",
    signature: "financial_core.can_view_finances(uuid)",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 520,
  }),
  obj({
    id: "fn.financial_core.can_manage_finances",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.can_manage_finances(uuid)",
    signature: "financial_core.can_manage_finances(uuid)",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 530,
  }),
  obj({
    id: "fn.financial_core.check_event_balance_from_posting",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.check_event_balance_from_posting()",
    signature: "financial_core.check_event_balance_from_posting()",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 540,
  }),
  obj({
    id: "fn.financial_core.check_event_balance_from_event",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.check_event_balance_from_event()",
    signature: "financial_core.check_event_balance_from_event()",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 550,
  }),
  obj({
    id: "fn.financial_core.assert_financial_event_balanced",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.assert_financial_event_balanced(uuid)",
    signature: "financial_core.assert_financial_event_balanced(uuid)",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 560,
  }),
  obj({
    id: "fn.financial_core.guard_financial_posting_history",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_financial_posting_history()",
    signature: "financial_core.guard_financial_posting_history()",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 570,
  }),
  obj({
    id: "fn.financial_core.guard_financial_event_history",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_financial_event_history()",
    signature: "financial_core.guard_financial_event_history()",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 580,
  }),
  obj({
    id: "fn.financial_core.guard_financial_event_epoch",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_financial_event_epoch()",
    signature: "financial_core.guard_financial_event_epoch()",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 590,
  }),
  obj({
    id: "fn.financial_core.guard_financial_category",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_financial_category()",
    signature: "financial_core.guard_financial_category()",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 600,
  }),
  obj({
    id: "fn.financial_core.guard_financial_fund",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_financial_fund()",
    signature: "financial_core.guard_financial_fund()",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 610,
  }),
  obj({
    id: "fn.financial_core.guard_financial_account",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.guard_financial_account()",
    signature: "financial_core.guard_financial_account()",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 620,
  }),
  obj({
    id: "fn.financial_core.currency_scale",
    kind: "function",
    schema: "financial_core",
    identity: "financial_core.currency_scale(text)",
    signature: "financial_core.currency_scale(text)",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 630,
  }),
  obj({
    id: "fn.financial_private.guard_ledger_epoch",
    kind: "function",
    schema: "financial_private",
    identity: "financial_private.guard_ledger_epoch()",
    signature: "financial_private.guard_ledger_epoch()",
    provenance: P118,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_FN,
    permittedDependentEffects: [],
    dropOrder: 640,
  }),
  obj({
    id: "tbl.financial_core.opening_provenances",
    kind: "table",
    schema: "financial_core",
    identity: "financial_core.opening_provenances",
    provenance: P123,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "trigger opening_provenances_immutable"],
    dropOrder: 700,
  }),
  obj({
    id: "tbl.financial_core.correction_command_payloads",
    kind: "table",
    schema: "financial_core",
    identity: "financial_core.correction_command_payloads",
    provenance: P122,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "trigger correction_command_payloads_immutable", "constraint trigger correction_command_payloads_complete"],
    dropOrder: 710,
  }),
  obj({
    id: "tbl.financial_core.posting_command_payloads",
    kind: "table",
    schema: "financial_core",
    identity: "financial_core.posting_command_payloads",
    provenance: P120,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "trigger posting_command_payloads_immutable", "constraint trigger posting_command_payloads_complete"],
    dropOrder: 720,
  }),
  obj({
    id: "tbl.public.financial_postings",
    kind: "table",
    schema: "public",
    identity: "public.financial_postings",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "triggers financial_postings_history_guard, financial_postings_balance_guard, financial_postings_f3_closure"],
    dropOrder: 730,
  }),
  obj({
    id: "tbl.public.financial_events",
    kind: "table",
    schema: "public",
    identity: "public.financial_events",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "triggers financial_events_epoch_guard, financial_events_history_guard, financial_events_balance_guard, financial_events_f3_correction_lineage", "index financial_events_occurrence_across_epochs"],
    dropOrder: 740,
  }),
  obj({
    id: "tbl.public.financial_categories",
    kind: "table",
    schema: "public",
    identity: "public.financial_categories",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "trigger financial_categories_guard"],
    dropOrder: 750,
  }),
  obj({
    id: "tbl.public.financial_funds",
    kind: "table",
    schema: "public",
    identity: "public.financial_funds",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "trigger financial_funds_guard"],
    dropOrder: 760,
  }),
  obj({
    id: "tbl.public.financial_accounts",
    kind: "table",
    schema: "public",
    identity: "public.financial_accounts",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "trigger financial_accounts_guard"],
    dropOrder: 770,
  }),
  obj({
    id: "tbl.public.financial_ledger_epochs",
    kind: "table",
    schema: "public",
    identity: "public.financial_ledger_epochs",
    provenance: P118,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "trigger financial_ledger_epoch_guard", "policy financial_ledger_epoch_active_reader", "gist exclusion financial_ledger_epoch_no_overlap"],
    dropOrder: 780,
  }),
  obj({
    id: "tbl.financial_private.internal_financial_tenants",
    kind: "table",
    schema: "financial_private",
    identity: "financial_private.internal_financial_tenants",
    provenance: P118,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 790,
  }),
  obj({
    id: "tbl.financial_private.epoch_transitions",
    kind: "table",
    schema: "financial_private",
    identity: "financial_private.epoch_transitions",
    provenance: P118,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 800,
  }),
  obj({
    id: "tbl.public.notification_policy_triggers",
    kind: "table",
    schema: "public",
    identity: "public.notification_policy_triggers",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "policies m2_npt_select, m2_npt_insert, m2_npt_update, m2_npt_delete"],
    dropOrder: 900,
  }),
  obj({
    id: "tbl.public.notification_policy_occurrences",
    kind: "table",
    schema: "public",
    identity: "public.notification_policy_occurrences",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 910,
  }),
  obj({
    id: "tbl.public.notification_policies",
    kind: "table",
    schema: "public",
    identity: "public.notification_policies",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 920,
  }),
  obj({
    id: "tbl.public.position_assignments",
    kind: "table",
    schema: "public",
    identity: "public.position_assignments",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 930,
  }),
  obj({
    id: "tbl.public.position_permissions",
    kind: "table",
    schema: "public",
    identity: "public.position_permissions",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 940,
  }),
  obj({
    id: "tbl.public.group_positions",
    kind: "table",
    schema: "public",
    identity: "public.group_positions",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 950,
  }),
  obj({
    id: "tbl.public.hosting_swap_requests",
    kind: "table",
    schema: "public",
    identity: "public.hosting_swap_requests",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 960,
  }),
  obj({
    id: "tbl.public.hosting_assignments",
    kind: "table",
    schema: "public",
    identity: "public.hosting_assignments",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 970,
  }),
  obj({
    id: "tbl.public.hosting_rosters",
    kind: "table",
    schema: "public",
    identity: "public.hosting_rosters",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 980,
  }),
  obj({
    id: "tbl.public.payment_obligation_applications",
    kind: "table",
    schema: "public",
    identity: "public.payment_obligation_applications",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 990,
  }),
  obj({
    id: "tbl.public.payments",
    kind: "table",
    schema: "public",
    identity: "public.payments",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1000,
  }),
  obj({
    id: "tbl.public.contribution_obligations",
    kind: "table",
    schema: "public",
    identity: "public.contribution_obligations",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1010,
  }),
  obj({
    id: "tbl.public.relief_remittances",
    kind: "table",
    schema: "public",
    identity: "public.relief_remittances",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1020,
  }),
  obj({
    id: "tbl.public.relief_claims",
    kind: "table",
    schema: "public",
    identity: "public.relief_claims",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1030,
  }),
  obj({
    id: "tbl.public.relief_enrollments",
    kind: "table",
    schema: "public",
    identity: "public.relief_enrollments",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1040,
  }),
  obj({
    id: "tbl.public.relief_plans",
    kind: "table",
    schema: "public",
    identity: "public.relief_plans",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1050,
  }),
  obj({
    id: "tbl.public.fines",
    kind: "table",
    schema: "public",
    identity: "public.fines",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1060,
  }),
  obj({
    id: "tbl.public.member_transfers",
    kind: "table",
    schema: "public",
    identity: "public.member_transfers",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1070,
  }),
  obj({
    id: "tbl.public.invitations",
    kind: "table",
    schema: "public",
    identity: "public.invitations",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1080,
  }),
  obj({
    id: "tbl.public.elections",
    kind: "table",
    schema: "public",
    identity: "public.elections",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1090,
  }),
  obj({
    id: "tbl.public.events",
    kind: "table",
    schema: "public",
    identity: "public.events",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1100,
  }),
  obj({
    id: "tbl.public.meeting_minutes",
    kind: "table",
    schema: "public",
    identity: "public.meeting_minutes",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1110,
  }),
  obj({
    id: "tbl.public.announcements",
    kind: "table",
    schema: "public",
    identity: "public.announcements",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1120,
  }),
  obj({
    id: "tbl.public.notifications_queue",
    kind: "table",
    schema: "public",
    identity: "public.notifications_queue",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1130,
  }),
  obj({
    id: "tbl.public.loans",
    kind: "table",
    schema: "public",
    identity: "public.loans",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1140,
  }),
  obj({
    id: "tbl.public.projects",
    kind: "table",
    schema: "public",
    identity: "public.projects",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "constraint projects_id_group_financial_scope from 00119"],
    dropOrder: 1150,
  }),
  obj({
    id: "tbl.public.group_subscriptions",
    kind: "table",
    schema: "public",
    identity: "public.group_subscriptions",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1160,
  }),
  obj({
    id: "tbl.public.memberships",
    kind: "table",
    schema: "public",
    identity: "public.memberships",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED, "constraint memberships_id_group_financial_scope from 00119"],
    dropOrder: 1170,
  }),
  obj({
    id: "tbl.public.groups",
    kind: "table",
    schema: "public",
    identity: "public.groups",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1180,
  }),
  obj({
    id: "tbl.public.profiles",
    kind: "table",
    schema: "public",
    identity: "public.profiles",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1190,
  }),
  obj({
    id: "tbl.public.organizations",
    kind: "table",
    schema: "public",
    identity: "public.organizations",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1200,
  }),
  obj({
    id: "tbl.public.__f3_acl_platform_canary_20260915",
    kind: "table",
    schema: "public",
    identity: "public.__f3_acl_platform_canary_20260915",
    provenance: P_HIST,
    requiredStartingState: "absent is success (F9 recorded skipping); present matching identity may be dropped",
    intendedAction: DROP_TBL,
    permittedDependentEffects: [OWNED],
    dropOrder: 1210,
  }),
  obj({
    id: "seq.public.__f3_acl_platform_canary_20260915_id_seq",
    kind: "sequence",
    schema: "public",
    identity: "public.__f3_acl_platform_canary_20260915_id_seq",
    provenance: P_HIST,
    requiredStartingState: "absent is success (F9 recorded skipping); orphaned sequence matching identity may be dropped",
    intendedAction: "DROP SEQUENCE public.__f3_acl_platform_canary_20260915_id_seq RESTRICT",
    permittedDependentEffects: [],
    dropOrder: 1220,
  }),
  obj({
    id: "type.public.financial_account_kind",
    kind: "type",
    schema: "public",
    identity: "public.financial_account_kind",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TYP,
    permittedDependentEffects: [],
    dropOrder: 1300,
  }),
  obj({
    id: "type.public.financial_account_status",
    kind: "type",
    schema: "public",
    identity: "public.financial_account_status",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TYP,
    permittedDependentEffects: [],
    dropOrder: 1310,
  }),
  obj({
    id: "type.public.financial_category_class",
    kind: "type",
    schema: "public",
    identity: "public.financial_category_class",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TYP,
    permittedDependentEffects: [],
    dropOrder: 1320,
  }),
  obj({
    id: "type.public.financial_config_status",
    kind: "type",
    schema: "public",
    identity: "public.financial_config_status",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TYP,
    permittedDependentEffects: [],
    dropOrder: 1330,
  }),
  obj({
    id: "type.public.financial_control_class",
    kind: "type",
    schema: "public",
    identity: "public.financial_control_class",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TYP,
    permittedDependentEffects: [],
    dropOrder: 1340,
  }),
  obj({
    id: "type.public.financial_event_class",
    kind: "type",
    schema: "public",
    identity: "public.financial_event_class",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TYP,
    permittedDependentEffects: [],
    dropOrder: 1350,
  }),
  obj({
    id: "type.public.financial_event_status",
    kind: "type",
    schema: "public",
    identity: "public.financial_event_status",
    provenance: P119,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TYP,
    permittedDependentEffects: [],
    dropOrder: 1360,
  }),
  obj({
    id: "type.public.notification_channel",
    kind: "type",
    schema: "public",
    identity: "public.notification_channel",
    provenance: P_HIST,
    requiredStartingState: PRESENT_OR_ABSENT,
    intendedAction: DROP_TYP,
    permittedDependentEffects: [],
    dropOrder: 1370,
  }),
  obj({
    id: "schema.financial_core",
    kind: "schema",
    schema: "financial_core",
    identity: "financial_core",
    provenance: P119,
    requiredStartingState: "exists and is empty of non-allowlisted objects after prior drops; unexpected contents BLOCK",
    intendedAction: DROP_SCH,
    permittedDependentEffects: [],
    dropOrder: 1400,
  }),
  obj({
    id: "schema.financial_private",
    kind: "schema",
    schema: "financial_private",
    identity: "financial_private",
    provenance: P118,
    requiredStartingState: "exists and is empty of non-allowlisted objects after prior drops; unexpected contents BLOCK",
    intendedAction: DROP_SCH,
    permittedDependentEffects: [],
    dropOrder: 1410,
  }),
  obj({
    id: "ext.btree_gist",
    kind: "extension",
    schema: "pg_catalog",
    identity: "btree_gist",
    provenance: P118,
    requiredStartingState: "present only if remaining dependents are empty after allowlisted drops; any leftover dependent BLOCKS",
    intendedAction: "DROP EXTENSION btree_gist RESTRICT. Skip only if identity probe shows already absent. BLOCK if dependents remain.",
    permittedDependentEffects: [],
    dropOrder: 1500,
  }),
]);

function dep({
  id,
  from,
  to,
  kind = "foreign_key",
  identity,
  handling,
  historicalNoticeOnly = false,
  provenance,
  naming,
}) {
  return Object.freeze({
    id,
    from,
    to,
    kind,
    identity,
    handling,
    historicalNoticeOnly,
    provenance,
    naming,
  });
}

const F12_TIP = "1ec0e4da782ed7715a543be23f79bc0f10a28af2";
const HIST_DEP = `historical F8/F9 leftover FK retained as complete tuple @ F12 tip ${F12_TIP}`;
const M118 = `supabase/migrations/00118_f3_bounded_financial_epoch_foundation.sql @ F12 tip ${F12_TIP}`;
const M119 = `supabase/migrations/00119_f3_01_core_ledger_foundation.sql @ F12 tip ${F12_TIP}`;
const M120 = `supabase/migrations/00120_f3_02_secure_posting_idempotency.sql @ F12 tip ${F12_TIP}`;
const M122 = `supabase/migrations/00122_f3_04_correction_reversal.sql @ F12 tip ${F12_TIP}`;
const M123 = `supabase/migrations/00123_f3_05_opening_cash_command.sql @ F12 tip ${F12_TIP}`;

/**
 * F15 mapping: F14 used two descriptive aggregates that are not catalog
 * identities (`posting_command_payloads.event_id -> …` and
 * `correction_command_payloads_fks`). Those are replaced by the actual
 * PostgreSQL names created by UNCHANGED migration SQL. Count rises
 * because the complete 00118–00123 FK set among allowlisted objects was
 * reviewed; object allowlist / destructive scope is unchanged.
 */
export const DEPENDENCY_ALLOWLIST_PROVENANCE = Object.freeze({
  f14AggregatesReplaced: Object.freeze([
    "posting_command_payloads.event_id -> public.financial_events.id",
    "correction_command_payloads target/reversal/replacement -> public.financial_events",
    "dep.financial_events.correction_command_payloads_fks",
  ]),
  catalogIdentitiesForThoseAggregates: Object.freeze([
    "posting_command_payloads_event_id_fkey",
    "correction_command_payloads_target_event_id_group_id_fkey",
    "correction_command_payloads_reversal_event_id_group_id_fkey",
    "correction_command_payloads_replacement_event_id_group_id_fkey",
  ]),
  countChangeReason: "aggregates were not catalog identities; complete migration-created FK tuples among allowlisted objects are listed instead. Object allowlist unchanged.",
  migrationsUnchanged: true,
  databaseConstraintsNotRenamed: true,
});

export const FINITE_DEPENDENCY_ALLOWLIST = Object.freeze([
  dep({
    id: "dep.groups.memberships_group_id_fkey",
    from: "public.memberships",
    to: "public.groups",
    identity: "memberships_group_id_fkey",
    handling: "drop public.memberships before public.groups; no CASCADE",
    historicalNoticeOnly: true,
    provenance: HIST_DEP,
    naming: "historical catalog name",
  }),
  dep({
    id: "dep.groups.projects_group_id_fkey",
    from: "public.projects",
    to: "public.groups",
    identity: "projects_group_id_fkey",
    handling: "drop public.projects before public.groups; no CASCADE",
    historicalNoticeOnly: true,
    provenance: HIST_DEP,
    naming: "historical catalog name",
  }),
  dep({
    id: "dep.groups.notification_policies_group_id_fkey",
    from: "public.notification_policies",
    to: "public.groups",
    identity: "notification_policies_group_id_fkey",
    handling: "drop public.notification_policies before public.groups; no CASCADE",
    historicalNoticeOnly: true,
    provenance: HIST_DEP,
    naming: "historical catalog name",
  }),
  dep({
    id: "dep.groups.notification_policy_occurrences_group_id_fkey",
    from: "public.notification_policy_occurrences",
    to: "public.groups",
    identity: "notification_policy_occurrences_group_id_fkey",
    handling: "drop public.notification_policy_occurrences before public.groups; no CASCADE",
    historicalNoticeOnly: true,
    provenance: HIST_DEP,
    naming: "historical catalog name",
  }),
  dep({
    id: "dep.memberships.position_assignments_membership_id_fkey",
    from: "public.position_assignments",
    to: "public.memberships",
    identity: "position_assignments_membership_id_fkey",
    handling: "drop public.position_assignments before public.memberships; no CASCADE",
    historicalNoticeOnly: true,
    provenance: HIST_DEP,
    naming: "historical catalog name",
  }),
  dep({
    id: "dep.notification_policies.notification_policy_triggers_policy_id_fkey",
    from: "public.notification_policy_triggers",
    to: "public.notification_policies",
    identity: "notification_policy_triggers_policy_id_fkey",
    handling: "drop public.notification_policy_triggers before public.notification_policies; no CASCADE",
    historicalNoticeOnly: true,
    provenance: HIST_DEP,
    naming: "historical catalog name",
  }),
  dep({
    id: "dep.financial_ledger_epochs.group_id",
    from: "public.financial_ledger_epochs",
    to: "public.groups",
    identity: "financial_ledger_epochs_group_id_fkey",
    handling: "owned by public.financial_ledger_epochs; drop table RESTRICT; no CASCADE",
    provenance: M118,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.groups(id)",
  }),
  dep({
    id: "dep.financial_ledger_epochs.created_by",
    from: "public.financial_ledger_epochs",
    to: "public.profiles",
    identity: "financial_ledger_epochs_created_by_fkey",
    handling: "owned by public.financial_ledger_epochs; drop table RESTRICT; no CASCADE",
    provenance: M118,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
  dep({
    id: "dep.financial_ledger_epochs.approved_by",
    from: "public.financial_ledger_epochs",
    to: "public.profiles",
    identity: "financial_ledger_epochs_approved_by_fkey",
    handling: "owned by public.financial_ledger_epochs; drop table RESTRICT; no CASCADE",
    provenance: M118,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
  dep({
    id: "dep.internal_financial_tenants.organization_id",
    from: "financial_private.internal_financial_tenants",
    to: "public.organizations",
    identity: "internal_financial_tenants_organization_id_fkey",
    handling: "owned by financial_private.internal_financial_tenants; drop table RESTRICT; no CASCADE",
    provenance: M118,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.organizations(id)",
  }),
  dep({
    id: "dep.internal_financial_tenants.created_by",
    from: "financial_private.internal_financial_tenants",
    to: "public.profiles",
    identity: "internal_financial_tenants_created_by_fkey",
    handling: "owned by financial_private.internal_financial_tenants; drop table RESTRICT; no CASCADE",
    provenance: M118,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
  dep({
    id: "dep.financial_accounts.group_id",
    from: "public.financial_accounts",
    to: "public.groups",
    identity: "financial_accounts_group_id_fkey",
    handling: "owned by public.financial_accounts; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.groups(id)",
  }),
  dep({
    id: "dep.financial_accounts.created_by",
    from: "public.financial_accounts",
    to: "public.profiles",
    identity: "financial_accounts_created_by_fkey",
    handling: "owned by public.financial_accounts; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
  dep({
    id: "dep.financial_accounts.epoch_scope",
    from: "public.financial_accounts",
    to: "public.financial_ledger_epochs",
    identity: "financial_accounts_epoch_scope",
    handling: "owned by public.financial_accounts; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_accounts_epoch_scope",
  }),
  dep({
    id: "dep.financial_funds.group_id",
    from: "public.financial_funds",
    to: "public.groups",
    identity: "financial_funds_group_id_fkey",
    handling: "owned by public.financial_funds; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.groups(id)",
  }),
  dep({
    id: "dep.financial_funds.created_by",
    from: "public.financial_funds",
    to: "public.profiles",
    identity: "financial_funds_created_by_fkey",
    handling: "owned by public.financial_funds; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
  dep({
    id: "dep.financial_categories.group_id",
    from: "public.financial_categories",
    to: "public.groups",
    identity: "financial_categories_group_id_fkey",
    handling: "owned by public.financial_categories; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.groups(id)",
  }),
  dep({
    id: "dep.financial_categories.created_by",
    from: "public.financial_categories",
    to: "public.profiles",
    identity: "financial_categories_created_by_fkey",
    handling: "owned by public.financial_categories; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
  dep({
    id: "dep.financial_events.group_id",
    from: "public.financial_events",
    to: "public.groups",
    identity: "financial_events_group_id_fkey",
    handling: "owned by public.financial_events; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.groups(id)",
  }),
  dep({
    id: "dep.financial_events.created_by",
    from: "public.financial_events",
    to: "public.profiles",
    identity: "financial_events_created_by_fkey",
    handling: "owned by public.financial_events; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
  dep({
    id: "dep.financial_events.epoch_scope",
    from: "public.financial_events",
    to: "public.financial_ledger_epochs",
    identity: "financial_events_epoch_scope",
    handling: "owned by public.financial_events; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_events_epoch_scope",
  }),
  dep({
    id: "dep.financial_events.reversal_scope",
    from: "public.financial_events",
    to: "public.financial_events",
    identity: "financial_events_reversal_scope",
    handling: "owned by public.financial_events; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_events_reversal_scope",
  }),
  dep({
    id: "dep.financial_events.replacement_scope",
    from: "public.financial_events",
    to: "public.financial_events",
    identity: "financial_events_replacement_scope",
    handling: "owned by public.financial_events; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_events_replacement_scope",
  }),
  dep({
    id: "dep.financial_postings.event_scope",
    from: "public.financial_postings",
    to: "public.financial_events",
    identity: "financial_postings_event_scope",
    handling: "owned by public.financial_postings; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_postings_event_scope",
  }),
  dep({
    id: "dep.financial_postings.account_scope",
    from: "public.financial_postings",
    to: "public.financial_accounts",
    identity: "financial_postings_account_scope",
    handling: "owned by public.financial_postings; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_postings_account_scope",
  }),
  dep({
    id: "dep.financial_postings.fund_scope",
    from: "public.financial_postings",
    to: "public.financial_funds",
    identity: "financial_postings_fund_scope",
    handling: "owned by public.financial_postings; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_postings_fund_scope",
  }),
  dep({
    id: "dep.financial_postings.category_scope",
    from: "public.financial_postings",
    to: "public.financial_categories",
    identity: "financial_postings_category_scope",
    handling: "owned by public.financial_postings; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_postings_category_scope",
  }),
  dep({
    id: "dep.financial_postings.member_scope",
    from: "public.financial_postings",
    to: "public.memberships",
    identity: "financial_postings_member_scope",
    handling: "owned by public.financial_postings; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_postings_member_scope",
  }),
  dep({
    id: "dep.financial_postings.project_scope",
    from: "public.financial_postings",
    to: "public.projects",
    identity: "financial_postings_project_scope",
    handling: "owned by public.financial_postings; drop table RESTRICT; no CASCADE",
    provenance: M119,
    naming: "named CONSTRAINT financial_postings_project_scope",
  }),
  dep({
    id: "dep.financial_events.posting_command_payloads_event_id_fkey",
    from: "financial_core.posting_command_payloads",
    to: "public.financial_events",
    identity: "posting_command_payloads_event_id_fkey",
    handling: "drop financial_core.posting_command_payloads before public.financial_events; no CASCADE",
    provenance: M120,
    naming: "PostgreSQL default {table}_{column}_fkey from event_id REFERENCES public.financial_events(id)",
  }),
  dep({
    id: "dep.correction_command_payloads.group_id",
    from: "financial_core.correction_command_payloads",
    to: "public.groups",
    identity: "correction_command_payloads_group_id_fkey",
    handling: "owned by financial_core.correction_command_payloads; drop table RESTRICT; no CASCADE",
    provenance: M122,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.groups(id)",
  }),
  dep({
    id: "dep.correction_command_payloads.correction_actor",
    from: "financial_core.correction_command_payloads",
    to: "public.profiles",
    identity: "correction_command_payloads_correction_actor_fkey",
    handling: "owned by financial_core.correction_command_payloads; drop table RESTRICT; no CASCADE",
    provenance: M122,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
  dep({
    id: "dep.correction_command_payloads.target_event",
    from: "financial_core.correction_command_payloads",
    to: "public.financial_events",
    identity: "correction_command_payloads_target_event_id_group_id_fkey",
    handling: "drop financial_core.correction_command_payloads before public.financial_events; no CASCADE",
    provenance: M122,
    naming: "PostgreSQL default {table}_{col1}_{col2}_fkey from unnamed FOREIGN KEY(target_event_id,group_id)",
  }),
  dep({
    id: "dep.correction_command_payloads.reversal_event",
    from: "financial_core.correction_command_payloads",
    to: "public.financial_events",
    identity: "correction_command_payloads_reversal_event_id_group_id_fkey",
    handling: "drop financial_core.correction_command_payloads before public.financial_events; no CASCADE",
    provenance: M122,
    naming: "PostgreSQL default {table}_{col1}_{col2}_fkey from unnamed FOREIGN KEY(reversal_event_id,group_id)",
  }),
  dep({
    id: "dep.correction_command_payloads.replacement_event",
    from: "financial_core.correction_command_payloads",
    to: "public.financial_events",
    identity: "correction_command_payloads_replacement_event_id_group_id_fkey",
    handling: "drop financial_core.correction_command_payloads before public.financial_events; no CASCADE",
    provenance: M122,
    naming: "PostgreSQL default {table}_{col1}_{col2}_fkey from unnamed FOREIGN KEY(replacement_event_id,group_id)",
  }),
  dep({
    id: "dep.opening_provenances.group_id",
    from: "financial_core.opening_provenances",
    to: "public.groups",
    identity: "opening_provenances_group_id_fkey",
    handling: "owned by financial_core.opening_provenances; drop table RESTRICT; no CASCADE",
    provenance: M123,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.groups(id)",
  }),
  dep({
    id: "dep.opening_provenances.recorded_by",
    from: "financial_core.opening_provenances",
    to: "public.profiles",
    identity: "opening_provenances_recorded_by_fkey",
    handling: "owned by financial_core.opening_provenances; drop table RESTRICT; no CASCADE",
    provenance: M123,
    naming: "PostgreSQL default {table}_{column}_fkey from REFERENCES public.profiles(id)",
  }),
]);

export const FORBIDDEN_SELECTORS = Object.freeze([
  "financial_* prefix as destructive allowlist",
  "DROP SCHEMA ... CASCADE",
  "DROP TABLE ... CASCADE",
  "DROP FUNCTION ... CASCADE",
  "DROP TYPE ... CASCADE",
  "DROP EXTENSION ... CASCADE",
  "unbounded pg_depend walk without finite allowlist check",
]);

export const TRANSACTION_PHASES = Object.freeze([
  Object.freeze({
    id: "T0_BIND",
    name: "identity_and_state_assertions",
    required: true,
    mutation: false,
    checks: Object.freeze([
      "HEAD equals bound functional candidate SHA",
      "connection ref/host/user/org equal disposable jkorwnwwmdeflfntxntl pins",
      "refuse production llbnliixczcqfftxpsmb",
      "refuse transaction pooler port 6543",
      "founder authorization artifact binds target+candidate+closure+scopeSqlIdentity+budget",
    ]),
  }),
  Object.freeze({
    id: "T1_BEGIN",
    name: "begin_serializable",
    required: true,
    mutation: false,
    checks: Object.freeze([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      "SET lock_timeout / statement_timeout / idle_in_transaction_session_timeout",
      "transaction-scoped advisory lock is helper only; not sufficient without SERIALIZABLE + object locks + revalidation",
    ]),
  }),
  Object.freeze({
    id: "T2_LOCK",
    name: "locking_and_serialization",
    required: true,
    mutation: false,
    checks: Object.freeze([
      "LOCK supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE",
      "LOCK allowlisted relations IN ACCESS EXCLUSIVE MODE (only identities in FINITE_OBJECT_ALLOWLIST)",
      "advisory xact lock key derived from bound scope digest (cooperative; assume hostile sessions ignore it)",
    ]),
  }),
  Object.freeze({
    id: "T3_REVALIDATE",
    name: "revalidate_before_mutation",
    required: true,
    mutation: false,
    checks: Object.freeze([
      "re-read object identities, dependents (pg_depend), and history rows AFTER locks",
      "observed set must equal permitted history set plus allowlisted objects; extras BLOCK",
      "history names must equal AUTHENTICATED_HISTORY_KEYS exactly",
      "unexpected dependency BLOCKS",
      "after locks, freshly query the transaction catalog for complete (kind,identity,from,to) tuples; do not substitute earlier JS capture",
      "live tuples must equal the captured approved starting set AND be in FINITE_DEPENDENCY_ALLOWLIST (37 tuples: 31 migration-created + 6 historical); unexpected/missing/changed BLOCK",
      "schema-qualified endpoints required; cross-boundary FK protection retained; allowlist not broadened",
    ]),
  }),
  Object.freeze({
    id: "T4_MUTATE",
    name: "mutation_order",
    required: true,
    mutation: true,
    checks: Object.freeze([
      "apply FINITE_OBJECT_ALLOWLIST by dropOrder using RESTRICT only",
      "DELETE history rows with version AND name equality only",
      "GET DIAGNOSTICS / RETURNING identities after each DELETE",
      "any SQL error rolls back the whole transaction",
    ]),
  }),
  Object.freeze({
    id: "T5_AFFECTED",
    name: "affected_row_and_identity_checks",
    required: true,
    mutation: false,
    checks: Object.freeze([
      "each history DELETE returns exactly the bound identity or 0 if pre-validated absent",
      "total deleted identities+count must match the pre-validated permitted set",
      "mismatched name never skips DELETE while other drops commit — whole TX aborts",
    ]),
  }),
  Object.freeze({
    id: "T6_FINAL",
    name: "final_assertions_before_commit",
    required: true,
    mutation: false,
    checks: Object.freeze([
      "allowlisted identities absent",
      "permitted history versions absent",
      "no unexpected leftover dependents",
      "CLEAN_BASELINE classifier predicates for this scope hold inside the same TX",
    ]),
  }),
  Object.freeze({
    id: "T7_COMMIT",
    name: "commit_or_uncertain",
    required: true,
    mutation: false,
    checks: Object.freeze([
      "COMMIT only after T6 passes",
      "serialization failure / deadlock / lock timeout / statement timeout => ROLLBACK, no retry loop, no second reset",
      "uncertain commit (session drop during COMMIT) => UNCERTAIN_COMMIT; no automatic replay; no unverifiable rollback claim",
    ]),
  }),
]);

export const UNCERTAIN_COMMIT_POLICY = Object.freeze({
  automaticReplay: false,
  unverifiableRollbackClaimForbidden: true,
  requiredLabel: "UNCERTAIN_COMMIT",
  nextStep: "stop; independent live inventory later under fresh founder authorization; do not claim rolled-back or applied",
});

export const LIVE_STATE_POLICY = Object.freeze({
  historicalSixRowDeletionEstablishesLiveState: false,
  liveCheckTonight: false,
  laterFailClosedLiveCheck: "Phase 2+ under founder authorization; inventory must match allowlist+history keys or BLOCK. No live contact in Phase 1.",
});

function fail(code, reason, extra = {}) {
  return {
    ok: false,
    executed: false,
    mutationEntrypointOpen: false,
    code,
    reason,
    ...extra,
  };
}

export function sha256Utf8(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

export function allowlistIdentities() {
  return FINITE_OBJECT_ALLOWLIST.map((o) => o.identity);
}

/**
 * Catalog-backed function identity used by inventory, planning, and TX.
 * Built from pg_proc.proargtypes + format_type — argument names are not
 * part of identity. Matches FINITE_OBJECT_ALLOWLIST forms:
 * schema.name(type,type,...) including zero-arg, arrays, and custom types.
 */
export const CANONICAL_FUNCTION_IDENTITY_SQL = `(n.nspname || '.' || p.proname || '(' || COALESCE((
    SELECT string_agg(pg_catalog.format_type(u.typoid, NULL), ',' ORDER BY u.ord)
    FROM unnest(p.proargtypes) WITH ORDINALITY AS u(typoid, ord)
  ), '') || ')')`;

const MULTIWORD_TYPE_ALIASES = Object.freeze([
  "timestamp with time zone",
  "timestamp without time zone",
  "time with time zone",
  "time without time zone",
  "double precision",
  "character varying",
  "bit varying",
]);

const TYPE_NAME_ALIASES = Object.freeze({
  timestamptz: "timestamp with time zone",
  timestamp: "timestamp without time zone",
  timetz: "time with time zone",
  "time": "time without time zone",
  int2: "smallint",
  int4: "integer",
  int8: "bigint",
  bool: "boolean",
  float4: "real",
  float8: "double precision",
  varchar: "character varying",
  varbit: "bit varying",
});

function isIdent(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);
}

function normalizeTypeToken(typeText) {
  let t = String(typeText ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const arraySuffix = [];
  while (/\[\]$/.test(t) || /\sARRAY$/i.test(t)) {
    if (/\[\]$/.test(t)) {
      t = t.slice(0, -2).trim();
      arraySuffix.push("[]");
    } else {
      t = t.replace(/\sARRAY$/i, "").trim();
      arraySuffix.push("[]");
    }
  }
  const parts = t.split(".");
  const last = parts[parts.length - 1];
  const aliased = TYPE_NAME_ALIASES[last] || last;
  if (parts.length > 1 && (parts[0] === "pg_catalog" || parts[0] === "public")) {
    t = aliased;
  } else if (parts.length > 1) {
    t = `${parts.slice(0, -1).join(".")}.${aliased}`;
  } else {
    t = aliased;
  }
  return `${t}${arraySuffix.join("")}`;
}

function looksLikeType(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t || t === "array") return false;
  if (MULTIWORD_TYPE_ALIASES.some((mw) => t === mw || t.startsWith(`${mw}[`) || t.startsWith(`${mw} array`))) {
    return true;
  }
  const unsuffixed = t.replace(/(\s*\[\]|\s+array)+$/g, "");
  if (TYPE_NAME_ALIASES[t] || TYPE_NAME_ALIASES[unsuffixed]) return true;
  if (/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*(\s*\[\]|\s+array)*$/i.test(t)) return true;
  return false;
}

function splitIdentityArgs(argList) {
  const out = [];
  let current = "";
  let depth = 0;
  for (const ch of String(argList ?? "")) {
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out;
}

function canonicalizeArgType(rawArg) {
  const raw = String(rawArg ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  for (const mw of MULTIWORD_TYPE_ALIASES) {
    const idx = lower.lastIndexOf(mw);
    if (idx >= 0) {
      const prefix = raw.slice(0, idx).trim();
      const typePart = raw.slice(idx).trim();
      if (!prefix || isIdent(prefix.split(/\s+/).pop())) {
        return normalizeTypeToken(typePart);
      }
    }
  }
  const tokens = raw.split(/\s+/);
  if (tokens.length >= 2 && isIdent(tokens[0]) && looksLikeType(tokens.slice(1).join(" "))) {
    return normalizeTypeToken(tokens.slice(1).join(" "));
  }
  return normalizeTypeToken(raw);
}

export function parseFunctionIdentity(identity) {
  const text = String(identity ?? "").trim();
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\((.*)\)\s*$/);
  if (!match) return null;
  const argTypes = match[3].trim() === ""
    ? []
    : splitIdentityArgs(match[3]).map((arg) => canonicalizeArgType(arg)).filter((arg) => arg !== "");
  return {
    schema: match[1],
    name: match[2],
    argTypes,
    identity: `${match[1]}.${match[2]}(${argTypes.join(",")})`,
  };
}

export function canonicalizeFunctionIdentity(identity) {
  const parsed = parseFunctionIdentity(identity);
  return parsed ? parsed.identity : String(identity ?? "");
}

export function functionIdentitiesEqual(a, b) {
  const left = parseFunctionIdentity(a);
  const right = parseFunctionIdentity(b);
  if (left && right) return left.identity === right.identity;
  return String(a ?? "") === String(b ?? "");
}

export function allowlistIdentityMatches(observed, allowed) {
  if (String(observed ?? "") === String(allowed ?? "")) return true;
  if (functionIdentitiesEqual(observed, allowed)) return true;
  return false;
}

export function canonicalDependencyTuple(dep) {
  if (dep == null || typeof dep === "string") return null;
  if (typeof dep !== "object" || Array.isArray(dep)) return null;
  const kind = dep.kind == null ? "" : String(dep.kind);
  const identity = dep.identity == null ? "" : String(dep.identity);
  const from = dep.from == null ? "" : String(dep.from);
  const to = dep.to == null ? "" : String(dep.to);
  if (!kind || !identity || !from || !to) return null;
  if (/\s|->/.test(identity)) return null;
  return Object.freeze({ kind, identity, from, to });
}

export function dependencyTuplesEqual(left, right) {
  const a = canonicalDependencyTuple(left);
  const b = canonicalDependencyTuple(right);
  if (!a || !b) return false;
  return a.kind === b.kind && a.identity === b.identity && a.from === b.from && a.to === b.to;
}

export function snapshotDependencyTuple(dep) {
  const tuple = canonicalDependencyTuple(dep);
  return tuple ? { ...tuple } : null;
}

export function dependencyTupleKey(dep) {
  const tuple = canonicalDependencyTuple(dep);
  return tuple ? `${tuple.kind}|${tuple.identity}|${tuple.from}|${tuple.to}` : null;
}

export const APPROVED_DEPENDENCY_TUPLE_COUNT = FINITE_DEPENDENCY_ALLOWLIST.length;
export const APPROVED_MIGRATION_CREATED_DEPENDENCY_COUNT = FINITE_DEPENDENCY_ALLOWLIST.filter((row) => row.historicalNoticeOnly !== true).length;
export const APPROVED_HISTORICAL_DEPENDENCY_COUNT = FINITE_DEPENDENCY_ALLOWLIST.filter((row) => row.historicalNoticeOnly === true).length;

export function isFinancialPrefixSelector(value) {
  const s = String(value ?? "").trim();
  return s === "financial_*" || /^financial_\*$/.test(s) || s === "financial_object";
}

export function validateObjectAllowlist(observedObjects = [], observedDependencies = []) {
  const allowed = allowlistIdentities();
  const unexpectedObjects = [];
  for (const item of observedObjects) {
    const identity = typeof item === "string" ? item : item?.identity;
    if (!identity) {
      unexpectedObjects.push({ identity: String(item), reason: "missing schema-qualified identity" });
      continue;
    }
    if (isFinancialPrefixSelector(identity)) {
      unexpectedObjects.push({ identity, reason: "financial_* prefix is not a destructive allowlist" });
      continue;
    }
    if (!allowed.some((allowedIdentity) => allowlistIdentityMatches(identity, allowedIdentity))) {
      unexpectedObjects.push({ identity, reason: "not in FINITE_OBJECT_ALLOWLIST" });
    }
  }
  const unexpectedDependencies = [];
  for (const dep of observedDependencies) {
    const tuple = canonicalDependencyTuple(dep);
    if (!tuple) {
      unexpectedDependencies.push({
        identity: typeof dep === "string" ? dep : (dep?.identity || String(dep)),
        reason: "dependency identity is incomplete; name-only fallback is forbidden; not in FINITE_DEPENDENCY_ALLOWLIST",
        observed: typeof dep === "string" ? { identity: dep } : dep,
      });
      continue;
    }
    if (!FINITE_DEPENDENCY_ALLOWLIST.some((allowed) => dependencyTuplesEqual(tuple, allowed))) {
      unexpectedDependencies.push({
        identity: tuple.identity,
        reason: "not in FINITE_DEPENDENCY_ALLOWLIST as a complete (kind,identity,from,to) tuple",
        observed: tuple,
      });
    }
  }
  if (unexpectedObjects.length || unexpectedDependencies.length) {
    return fail("F13_UNEXPECTED_OBJECT_OR_DEPENDENCY", "Unexpected object or dependency blocks reset", {
      unexpectedObjects,
      unexpectedDependencies,
    });
  }
  return {
    ok: true,
    executed: false,
    mutationEntrypointOpen: false,
    allowedCount: FINITE_OBJECT_ALLOWLIST.length,
    dependencyCount: FINITE_DEPENDENCY_ALLOWLIST.length,
  };
}

export function validateNoBroadCascade(sqlText) {
  const sql = String(sqlText ?? "");
  const hits = [];
  if (/DROP\s+SCHEMA[\s\S]{0,120}CASCADE/i.test(sql)) hits.push("DROP SCHEMA CASCADE");
  if (/DROP\s+TABLE[\s\S]{0,200}CASCADE/i.test(sql)) hits.push("DROP TABLE CASCADE");
  if (/DROP\s+FUNCTION[\s\S]{0,300}CASCADE/i.test(sql)) hits.push("DROP FUNCTION CASCADE");
  if (/DROP\s+TYPE[\s\S]{0,200}CASCADE/i.test(sql)) hits.push("DROP TYPE CASCADE");
  if (/DROP\s+EXTENSION[\s\S]{0,80}CASCADE/i.test(sql)) hits.push("DROP EXTENSION CASCADE");
  if (/DROP\s+SEQUENCE[\s\S]{0,200}CASCADE/i.test(sql)) hits.push("DROP SEQUENCE CASCADE");
  if (hits.length) {
    return fail("F13_BROAD_CASCADE_FORBIDDEN", "Broad CASCADE is not a permitted design action", { hits });
  }
  return { ok: true, executed: false, mutationEntrypointOpen: false };
}

export function validateHistoryKeys(observedRows = [], { allowNullEmpty = false } = {}) {
  const expected = new Map(AUTHENTICATED_HISTORY_KEYS.map((k) => [k.version, k]));
  const permittedVersions = new Set(AUTHENTICATED_HISTORY_KEYS.map((k) => k.version));
  const errors = [];
  let matched = 0;
  for (const row of observedRows) {
    const version = row?.version == null ? "" : String(row.version);
    const name = row?.name;
    if (!permittedVersions.has(version)) {
      errors.push({ version, name, reason: "version outside authenticated PREASSIGNED set; abort whole operation" });
      continue;
    }
    const exp = expected.get(version);
    const nameMissing = name == null || String(name).trim() === "";
    if (nameMissing) {
      if (!allowNullEmpty || NULL_OR_EMPTY_NAME_PROVENANCE.authenticated !== true) {
        errors.push({
          version,
          name,
          reason: "null/empty name rejected; no authenticated null-name provenance in finite scope; abort whole operation",
        });
        continue;
      }
    }
    if (String(name) !== exp.name) {
      errors.push({
        version,
        name,
        expectedName: exp.name,
        reason: "mismatched name aborts the WHOLE operation; never skip DELETE while object destruction commits",
      });
      continue;
    }
    matched += 1;
  }
  if (errors.length) {
    return fail("F13_HISTORY_KEY_MISMATCH", "History key mismatch aborts the whole operation", {
      errors,
      historicalSixRowDeletionEstablishesLiveState: false,
    });
  }
  return {
    ok: true,
    executed: false,
    mutationEntrypointOpen: false,
    matched,
    permittedCount: AUTHENTICATED_HISTORY_KEYS.length,
    historicalSixRowDeletionEstablishesLiveState: false,
    liveCheckRequiredLater: true,
  };
}

export function validateHistorySqlPredicate(sqlText) {
  const sql = String(sqlText ?? "");
  const hits = [];
  if (/name\s+IS\s+NULL/i.test(sql)) hits.push("name IS NULL substitution");
  if (/name\s*=\s*''/i.test(sql)) hits.push("empty-name substitution");
  if (/OR\s+name\s+IS\s+NULL/i.test(sql)) hits.push("OR name IS NULL");
  const deletes = [...sql.matchAll(/DELETE\s+FROM\s+supabase_migrations\.schema_migrations[\s\S]*?;/gi)];
  for (const m of deletes) {
    const stmt = m[0];
    if (!/version\s*=/.test(stmt) || !/name\s*=/.test(stmt) || /name\s+IS\s+NULL/i.test(stmt)) {
      hits.push("DELETE without exact version AND name equality");
    }
  }
  if (hits.length) {
    return fail("F13_HISTORY_SOURCE_LABEL_SUBSTITUTION", "Source-label substitution for history keys is rejected", { hits });
  }
  return { ok: true, executed: false, mutationEntrypointOpen: false };
}

export function validateFounderAuthorizationBinding(binding = {}) {
  const required = [
    "targetRef",
    "functionalCandidateSha",
    "closureDigest",
    "scopeSqlIdentitySha256",
    "executionBudget",
  ];
  const missing = required.filter((k) => binding[k] == null || String(binding[k]).trim() === "");
  if (missing.length) {
    return fail("F13_FOUNDER_AUTH_INCOMPLETE", "Flag alone is not founder authorization", {
      missing,
      flagAloneIsNotAuthorization: true,
    });
  }
  if (binding.targetRef !== APPROVED_DISPOSABLE_PROJECT_REF) {
    return fail("F13_FOUNDER_AUTH_TARGET", "Authorization target is not the bound disposable", {
      targetRef: binding.targetRef,
    });
  }
  if (String(binding.targetRef) === PRODUCTION_REF || /llbnliixczcqfftxpsmb/i.test(JSON.stringify(binding))) {
    return fail("F13_PRODUCTION_REFUSED", "Production ref is refused");
  }
  const budget = binding.executionBudget || {};
  if (budget.constrainedResets !== 1 || budget.completeQualsFrom00118 !== 1 || budget.secondReset !== false) {
    return fail("F13_BUDGET_INVALID", "Execution budget must be exactly one reset and one qualify", { budget });
  }
  if (binding.wipeToBaseline === true || binding.flag === "--wipe-to-baseline") {
    return fail(F13_WIPE_REJECTION_CODE, "wipe-to-baseline remains rejected");
  }
  if (binding.flag === "--qualification-reset" && binding.authorizationArtifactSatisfied !== true) {
    return fail("F13_FLAG_NOT_AUTHORIZATION", "Proposed Phase-2 flag is not founder authorization by itself");
  }
  return {
    ok: true,
    executed: false,
    mutationEntrypointOpen: false,
    flagAloneIsNotAuthorization: true,
    bound: Object.freeze({
      targetRef: binding.targetRef,
      functionalCandidateSha: binding.functionalCandidateSha,
      closureDigest: binding.closureDigest,
      scopeSqlIdentitySha256: binding.scopeSqlIdentitySha256,
      executionBudget: budget,
    }),
  };
}

export function validateTransactionContract(plan = {}) {
  const have = new Set((plan.phases || []).map((p) => p.id || p));
  const missing = TRANSACTION_PHASES.filter((p) => !have.has(p.id)).map((p) => p.id);
  if (missing.length) {
    return fail("F13_TX_PHASES_INCOMPLETE", "Complete transaction phases are required", { missing });
  }
  if (plan.advisoryLockOnly === true && plan.serializable !== true) {
    return fail("F13_ADVISORY_LOCK_INSUFFICIENT", "Advisory locking alone is insufficient without cooperation assumptions");
  }
  if (plan.automaticReplay === true) {
    return fail("F13_AUTOMATIC_REPLAY_FORBIDDEN", "Uncertain commit must not automatically replay");
  }
  if (plan.claimRollbackWithoutEvidence === true) {
    return fail("F13_UNVERIFIABLE_ROLLBACK_FORBIDDEN", "Unverifiable rollback claim is forbidden");
  }
  return {
    ok: true,
    executed: false,
    mutationEntrypointOpen: false,
    uncertainCommit: UNCERTAIN_COMMIT_POLICY,
  };
}

export function rejectLiveContact(input = {}) {
  const blob = JSON.stringify(input);
  const needles = [
    "DATABASE_URL",
    "DISPOSABLE_DB_URL",
    "VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD",
    "pgbouncer",
    "postgresql://",
    "postgres://",
  ];
  const hit = needles.find((n) => blob.includes(n));
  if (hit) {
    return fail("F13_LIVE_CONTACT_FORBIDDEN", "Phase 1 design planner refuses live connection material", { hit });
  }
  if (input.execute === true || input.apply === true || input.connect === true) {
    return fail("F13_MUTATION_ENTRYPOINT_CLOSED", "Mutation entrypoint is not open in Phase 1");
  }
  return { ok: true, executed: false, mutationEntrypointOpen: false };
}

export function planQualificationResetDesign(input = {}) {
  const live = rejectLiveContact(input);
  if (!live.ok) return live;

  const cascade = validateNoBroadCascade(input.sqlText || "");
  if (!cascade.ok) return cascade;

  const historySql = input.sqlText ? validateHistorySqlPredicate(input.sqlText) : { ok: true };
  if (!historySql.ok) return historySql;

  const objects = validateObjectAllowlist(input.observedObjects || [], input.observedDependencies || []);
  if (!objects.ok) return objects;

  const history = validateHistoryKeys(input.observedHistoryRows || []);
  if (!history.ok) return history;

  const auth = input.authorization
    ? validateFounderAuthorizationBinding(input.authorization)
    : fail("F13_FOUNDER_AUTH_INCOMPLETE", "Flag alone is not founder authorization", {
      missing: ["authorization"],
      flagAloneIsNotAuthorization: true,
    });
  if (!auth.ok) return auth;

  const tx = validateTransactionContract(input.transaction || {
    phases: TRANSACTION_PHASES,
    advisoryLockOnly: false,
    serializable: true,
    automaticReplay: false,
    claimRollbackWithoutEvidence: false,
  });
  if (!tx.ok) return tx;

  return {
    ok: true,
    executed: false,
    mutationEntrypointOpen: false,
    phase: F13_PHASE,
    label: F13_DESIGN_LABEL,
    status: F13_DESIGN_STATUS,
    wipeToBaselineRejected: true,
    wipeRejectionCode: F13_WIPE_REJECTION_CODE,
    historicalSixRowDeletionEstablishesLiveState: false,
    liveCheckTonight: false,
    target: Object.freeze({
      accept: APPROVED_DISPOSABLE_PROJECT_REF,
      name: APPROVED_DISPOSABLE_PROJECT_NAME,
      org: APPROVED_DISPOSABLE_ORG_ID,
      host: APPROVED_DISPOSABLE_HOST,
      poolerHost: APPROVED_DISPOSABLE_POOLER_HOST,
      poolerPort: APPROVED_DISPOSABLE_POOLER_PORT,
      poolerUser: APPROVED_DISPOSABLE_POOLER_USER,
      reject: Object.freeze([PRODUCTION_REF, `transaction pooler :${TRANSACTION_POOLER_PORT}`]),
    }),
    cliPin: CLI_PIN,
    objectCount: FINITE_OBJECT_ALLOWLIST.length,
    dependencyCount: FINITE_DEPENDENCY_ALLOWLIST.length,
    historyKeyCount: AUTHENTICATED_HISTORY_KEYS.length,
    authorization: auth.bound,
    transactionPhases: TRANSACTION_PHASES.map((p) => p.id),
    uncertainCommit: UNCERTAIN_COMMIT_POLICY,
    liveStatePolicy: LIVE_STATE_POLICY,
    supportedInterface: F13_SUPPORTED_INTERFACE,
    scopeSqlIdentitySha256: input.authorization.scopeSqlIdentitySha256,
  };
}

export function exportDesignArtifact() {
  return {
    schema: "f13-qualification-reset-design-v1",
    label: F13_DESIGN_LABEL,
    status: F13_DESIGN_STATUS,
    phase: F13_PHASE,
    mutationEntrypointOpen: false,
    wipeToBaselineRejected: true,
    wipeRejectionCode: F13_WIPE_REJECTION_CODE,
    objects: FINITE_OBJECT_ALLOWLIST,
    dependencies: FINITE_DEPENDENCY_ALLOWLIST,
    forbiddenSelectors: FORBIDDEN_SELECTORS,
    historyKeys: AUTHENTICATED_HISTORY_KEYS,
    nullOrEmptyNameProvenance: NULL_OR_EMPTY_NAME_PROVENANCE,
    transactionPhases: TRANSACTION_PHASES,
    uncertainCommit: UNCERTAIN_COMMIT_POLICY,
    liveStatePolicy: LIVE_STATE_POLICY,
    supportedInterface: F13_SUPPORTED_INTERFACE,
  };
}

export function scopeSqlIdentityDigest() {
  const canonical = JSON.stringify({
    objects: FINITE_OBJECT_ALLOWLIST.map((o) => ({ id: o.id, identity: o.identity, action: o.intendedAction, dropOrder: o.dropOrder })),
    dependencies: FINITE_DEPENDENCY_ALLOWLIST.map((d) => ({
      id: d.id,
      kind: d.kind,
      identity: d.identity,
      from: d.from,
      to: d.to,
    })),
    history: AUTHENTICATED_HISTORY_KEYS,
  });
  return sha256Utf8(canonical);
}
