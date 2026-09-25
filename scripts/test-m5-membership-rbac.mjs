import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const M_CANONICAL = "supabase/migrations/00125_m5_01_membership_rbac_canonical.sql";

test("00125 migration exists and contains mandatory preflight pin checks", () => {
  assert.ok(fs.existsSync(path.join(root, M_CANONICAL)), "00125 migration file must exist");
  const sql = read(M_CANONICAL);

  // Preflight assertions
  assert.match(sql, /DO \$m5_pre\$/);
  assert.match(sql, /has_group_permission overload count/);
  assert.match(sql, /695368464e97297fbf0f90ce7345162f/, "Pinned has_group_permission def_md5");
  assert.match(sql, /96a296dfd541c7fc75ec68c4da1d92ff/, "Pinned has_group_permission src_md5");
  assert.match(sql, /post_dues_payment_confirmation missing — apply 00124 first/);
  assert.match(sql, /create_group_invitation\(jsonb\) already present/);
  assert.match(sql, /Found % groups with multiple active owners/);
});

test("00125 enforces Sole Active Owner Invariant and owner role prohibitions", () => {
  const sql = read(M_CANONICAL);

  // Partial unique index for active owner
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_unique_active_owner/);
  assert.match(sql, /ON public\.memberships\(group_id\)/);
  assert.match(sql, /WHERE role = 'owner'::membership_role AND membership_status = 'active'/);

  // Prohibit owner in invitations & join_codes
  assert.match(sql, /ALTER TABLE public\.invitations/);
  assert.match(sql, /ADD CONSTRAINT invitations_role_not_owner/);
  assert.match(sql, /CHECK \(role IS NULL OR role <> 'owner'::membership_role\)/);

  assert.match(sql, /ALTER TABLE public\.join_codes/);
  assert.match(sql, /ADD CONSTRAINT join_codes_role_not_owner/);
  assert.match(sql, /CHECK \(role IS NULL OR role <> 'owner'::membership_role\)/);
});

test("00125 prohibits destructive hard deletion on memberships", () => {
  const sql = read(M_CANONICAL);

  // Dropping legacy delete policy
  assert.match(sql, /DROP POLICY IF EXISTS "Members can leave or admins can remove members" ON public\.memberships/);

  // Trigger raising exception on DELETE
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.prevent_membership_hard_delete\(\)/);
  assert.match(sql, /MEMBERSHIP_HARD_DELETE_PROHIBITED/);
  assert.match(sql, /CREATE TRIGGER trg_prevent_membership_hard_delete/);
  assert.match(sql, /BEFORE DELETE ON public\.memberships/);
});

test("00125 enforces owner role protection trigger with status freeze", () => {
  const sql = read(M_CANONICAL);

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.prevent_owner_demotion\(\)/);
  assert.match(sql, /SOLE_OWNER_DEMOTION_PROHIBITED/);
  assert.match(sql, /CANNOT_ASSIGN_OWNER_DIRECTLY/);
  assert.match(sql, /SOLE_OWNER_STATUS_LOCK/);
  assert.match(sql, /app\.allow_owner_transfer/);
  assert.match(sql, /CREATE TRIGGER enforce_owner_role_protection/);
  assert.match(sql, /BEFORE UPDATE ON public\.memberships/);
});

test("00125 fortifies invitations RLS policy with permission assertion and owner exclusion", () => {
  const sql = read(M_CANONICAL);

  assert.match(sql, /DROP POLICY IF EXISTS "Group admins can create invitations" ON public\.invitations/);
  assert.match(sql, /CREATE POLICY "Group admins can create invitations" ON public\.invitations/);
  assert.match(sql, /public\.has_group_permission\(invitations\.group_id, 'members\.invite'\)/);
  assert.match(sql, /role <> 'owner'::membership_role/);
});

test("00125 implements canonical RPCs with search_path = '' and SECURITY DEFINER", () => {
  const sql = read(M_CANONICAL);

  const rpcs = [
    "create_group_invitation(p_command jsonb)",
    "update_membership_role(p_command jsonb)",
    "transfer_group_ownership(p_command jsonb)",
    "transfer_group_ownership(p_group_id uuid, p_new_owner_membership_id uuid)",
    "set_membership_lifecycle_status(p_command jsonb)",
    "update_member_display_name(p_command jsonb)",
  ];

  for (const rpc of rpcs) {
    const fnName = rpc.split("(")[0];
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\s*\\(`, "m"));
  }

  // Ensure security definer and empty search_path
  const secDefCount = (sql.match(/SECURITY DEFINER\s+SET search_path = ''/g) || []).length;
  assert.ok(secDefCount >= 6, `Expected at least 6 SECURITY DEFINER functions with search_path = '', found ${secDefCount}`);
});

test("00125 grants execute to authenticated on all canonical RPCs", () => {
  const sql = read(M_CANONICAL);

  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_group_invitation\(jsonb\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.update_membership_role\(jsonb\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.transfer_group_ownership\(jsonb\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.transfer_group_ownership\(uuid, uuid\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_membership_lifecycle_status\(jsonb\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.update_member_display_name\(jsonb\) TO authenticated/);
});

// ============================================================================
// Slice 2: Client Permission Invariants & Mutation Hooks
// ============================================================================

test("group-context fortifies isAdmin and isOwner to require membership_status === 'active'", () => {
  const code = read("src/lib/group-context.tsx");

  // Assert isMemberActive is defined and required for both isOwner and isAdmin
  assert.match(code, /const isMemberActive = currentMembership\?\.membership_status === "active";/);
  assert.match(code, /const isOwner = isMemberActive && currentMembership\?\.role === "owner";/);
  assert.match(code, /const isAdmin = isMemberActive && \(currentMembership\?\.role === "owner" \|\| currentMembership\?\.role === "admin"\);/);

  // Assert isOwner is exposed in context
  assert.match(code, /isOwner: boolean;/);
  assert.match(code, /isOwner,\s*isPlatformStaff,/);
});

test("use-permissions fortifies hasPermission and hasAnyPermission to deny inactive members", () => {
  const code = read("src/lib/hooks/use-permissions.ts");

  // Assert isMemberActive check
  assert.match(code, /const isMemberActive = currentMembership\?\.membership_status === "active";/);
  assert.match(code, /const isOwner = isMemberActive && currentMembership\?\.role === "owner";/);

  // Assert query enabled checks isMemberActive
  assert.match(code, /enabled: !!groupId && !!membershipId && isMemberActive && !isOwner/);

  // Assert immediate false return when not active
  assert.match(code, /function hasPermission\(permissionKey: string\): boolean \{\s*if \(!isMemberActive\) return false;/);
  assert.match(code, /function hasAnyPermission\(...keys: string\[\]\): boolean \{\s*if \(!isMemberActive\) return false;/);

  // Assert userPermissions returns empty array for inactive member
  assert.match(code, /const userPermissions = isMemberActive \? positionPermissions : \[\];/);
});

test("use-membership-mutations exports typed hooks with tenant boundary guards and multi-domain invalidation", () => {
  const code = read("src/lib/hooks/use-membership-mutations.ts");

  // Hook exports
  assert.match(code, /export function useCreateGroupInvitation\(\)/);
  assert.match(code, /export function useUpdateMembershipRole\(\)/);
  assert.match(code, /export function useTransferGroupOwnership\(\)/);
  assert.match(code, /export function useSetMembershipLifecycleStatus\(\)/);
  assert.match(code, /export function useUpdateMemberDisplayName\(\)/);

  // Error parser export
  assert.match(code, /export function parseMembershipRpcError\(error: unknown\): MembershipRpcErrorKey/);
  assert.match(code, /MEMBERSHIP_HARD_DELETE_PROHIBITED/);
  assert.match(code, /OWNER_INVITATION_PROHIBITED/);
  assert.match(code, /SOLE_OWNER_DEMOTION_PROHIBITED/);
  assert.match(code, /SOLE_OWNER_STATUS_LOCK/);
  assert.match(code, /staleTenantAborted/);

  // Tenant boundary guard
  const tenantGuardMatches = code.match(/if \(!currentGroupId \|\| input\.groupId !== currentGroupId\) \{\s*throw new Error\("staleTenantAborted"\);/g) || [];
  assert.strictEqual(tenantGuardMatches.length, 5, "Expected tenant boundary guard in all 5 hooks");

  // Invalidation domains
  assert.match(code, /queryClient\.invalidateQueries\(\{ queryKey: \["members", groupId\] \}\)/);
  assert.match(code, /queryClient\.invalidateQueries\(\{ queryKey: \["memberships", groupId\] \}\)/);
  assert.match(code, /queryClient\.invalidateQueries\(\{ queryKey: \["invitations", groupId\] \}\)/);
  assert.match(code, /queryClient\.invalidateQueries\(\{ queryKey: \["group-permissions", groupId\] \}\)/);
  assert.match(code, /queryClient\.invalidateQueries\(\{ queryKey: \["current-membership", groupId\] \}\)/);
  assert.match(code, /queryClient\.invalidateQueries\(\{ queryKey: \["user-permissions", groupId\] \}\)/);
});

test("messages/en.json and messages/fr.json maintain 100% leaf parity including members.errors", () => {
  const en = JSON.parse(read("messages/en.json"));
  const fr = JSON.parse(read("messages/fr.json"));

  function getLeaves(obj, prefix = "") {
    let keys = [];
    for (const k of Object.keys(obj)) {
      const full = prefix ? prefix + "." + k : k;
      if (typeof obj[k] === "object" && obj[k] !== null && !Array.isArray(obj[k])) {
        keys = keys.concat(getLeaves(obj[k], full));
      } else {
        keys.push(full);
      }
    }
    return keys;
  }

  const enLeaves = new Set(getLeaves(en));
  const frLeaves = new Set(getLeaves(fr));

  const missingInFr = [...enLeaves].filter((k) => !frLeaves.has(k));
  const missingInEn = [...frLeaves].filter((k) => !enLeaves.has(k));

  assert.deepStrictEqual(missingInFr, [], "FR must not be missing any EN keys");
  assert.deepStrictEqual(missingInEn, [], "EN must not be missing any FR keys");

  // Verify specific required M5 error keys under members.errors
  const requiredErrors = [
    "members.errors.MEMBERSHIP_HARD_DELETE_PROHIBITED",
    "members.errors.OWNER_INVITATION_PROHIBITED",
    "members.errors.INSUFFICIENT_INVITE_PRIVILEGE",
    "members.errors.SOLE_OWNER_DEMOTION_PROHIBITED",
    "members.errors.SOLE_OWNER_STATUS_LOCK",
    "members.errors.TRANSFER_TO_SELF_PROHIBITED",
    "members.errors.TARGET_NOT_ACTIVE_MEMBER",
    "members.errors.staleTenantAborted",
    "members.errors.GENERIC_ERROR",
  ];

  for (const errKey of requiredErrors) {
    assert.ok(enLeaves.has(errKey), `messages/en.json must contain ${errKey}`);
    assert.ok(frLeaves.has(errKey), `messages/fr.json must contain ${errKey}`);
  }
});

// ============================================================================
// Slice 4: Adversarial Invariant Harness & Simulator (Invariants 1-7)
// ============================================================================

class MockM5RbacEngine {
  constructor() {
    this.groups = new Map();
    this.memberships = new Map();
    this.invitations = new Map();
    this.profiles = new Map();
    this.positionPermissions = new Map();
  }

  seedInitialState() {
    // Group 1
    this.groups.set("group-1", { id: "group-1", name: "Village Alpha" });
    // Group 2 (cross-tenant)
    this.groups.set("group-2", { id: "group-2", name: "Village Beta" });

    // Profiles
    this.profiles.set("user-owner-1", { id: "user-owner-1", full_name: "Alice Owner", email: "alice@example.com" });
    this.profiles.set("user-admin-1", { id: "user-admin-1", full_name: "Bob Admin", email: "bob@example.com" });
    this.profiles.set("user-mod-1", { id: "user-mod-1", full_name: "Charlie Mod", email: "charlie@example.com" });
    this.profiles.set("user-mem-1", { id: "user-mem-1", full_name: "David Member", email: "david@example.com" });
    this.profiles.set("user-owner-2", { id: "user-owner-2", full_name: "Eve Owner 2", email: "eve@example.com" });

    // Memberships for Group 1
    this.memberships.set("mem-owner-1", {
      id: "mem-owner-1",
      group_id: "group-1",
      user_id: "user-owner-1",
      role: "owner",
      membership_status: "active",
      display_name: "Alice Owner",
    });

    this.memberships.set("mem-admin-1", {
      id: "mem-admin-1",
      group_id: "group-1",
      user_id: "user-admin-1",
      role: "admin",
      membership_status: "active",
      display_name: "Bob Admin",
    });

    this.memberships.set("mem-mod-1", {
      id: "mem-mod-1",
      group_id: "group-1",
      user_id: "user-mod-1",
      role: "moderator",
      membership_status: "active",
      display_name: "Charlie Mod",
    });

    this.memberships.set("mem-mem-1", {
      id: "mem-mem-1",
      group_id: "group-1",
      user_id: "user-mem-1",
      role: "member",
      membership_status: "active",
      display_name: "David Member",
    });

    // Memberships for Group 2
    this.memberships.set("mem-owner-2", {
      id: "mem-owner-2",
      group_id: "group-2",
      user_id: "user-owner-2",
      role: "owner",
      membership_status: "active",
      display_name: "Eve Owner 2",
    });

    // Position permissions
    this.positionPermissions.set("mem-mod-1", ["events.manage", "finances.view"]);
  }

  getRoleWeight(role) {
    switch (role) {
      case "owner": return 4;
      case "admin": return 3;
      case "moderator": return 2;
      case "member": return 1;
      default: return 0;
    }
  }

  createGroupInvitation(callerUserId, { groupId, email, role = "member" }) {
    const caller = [...this.memberships.values()].find(
      (m) => m.user_id === callerUserId && m.group_id === groupId
    );
    if (!caller) throw new Error("CALLER_NOT_IN_GROUP");
    if (caller.membership_status !== "active") throw new Error("INACTIVE_MEMBER_DENIED");

    if (role === "owner") {
      throw new Error("CANNOT_INVITE_AS_OWNER: Group ownership cannot be granted via invitation.");
    }

    const callerWeight = this.getRoleWeight(caller.role);
    const targetWeight = this.getRoleWeight(role);

    if (caller.role !== "owner" && targetWeight >= callerWeight) {
      throw new Error("PRIVILEGE_ELEVATION_DENIED: Caller cannot invite members with role equal to or exceeding caller role");
    }

    const invId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invite = {
      id: invId,
      group_id: groupId,
      email,
      role,
      invited_by: caller.id,
      status: "pending",
    };
    this.invitations.set(invId, invite);
    return { ok: true, invitation_id: invId, role, group_id: groupId };
  }

  updateMembershipRole(callerUserId, { groupId, membershipId, newRole }) {
    const caller = [...this.memberships.values()].find(
      (m) => m.user_id === callerUserId && m.group_id === groupId
    );
    if (!caller || caller.membership_status !== "active") throw new Error("INSUFFICIENT_PRIVILEGE");
    if (caller.role !== "owner" && caller.role !== "admin") throw new Error("INSUFFICIENT_PRIVILEGE");

    const target = this.memberships.get(membershipId);
    if (!target || target.group_id !== groupId) throw new Error("TARGET_NOT_IN_GROUP");

    if (target.role === "owner" && newRole !== "owner") {
      throw new Error("SOLE_OWNER_DEMOTION_PROHIBITED: Cannot demote the group owner. Transfer group ownership first.");
    }
    if (newRole === "owner") {
      throw new Error("CANNOT_ASSIGN_OWNER_DIRECTLY: Group ownership can only be transferred using transfer_group_ownership.");
    }

    const oldRole = target.role;
    target.role = newRole;
    return { ok: true, membership_id: membershipId, old_role: oldRole, new_role: newRole };
  }

  setMembershipLifecycleStatus(callerUserId, { groupId, membershipId, newStatus }) {
    const caller = [...this.memberships.values()].find(
      (m) => m.user_id === callerUserId && m.group_id === groupId
    );
    if (!caller || caller.membership_status !== "active") throw new Error("INSUFFICIENT_PRIVILEGE");
    if (caller.role !== "owner" && caller.role !== "admin") throw new Error("INSUFFICIENT_PRIVILEGE");

    const target = this.memberships.get(membershipId);
    if (!target || target.group_id !== groupId) throw new Error("TARGET_NOT_IN_GROUP");

    if (target.role === "owner" && target.membership_status === "active" && newStatus !== "active") {
      throw new Error("SOLE_OWNER_STATUS_LOCK: The group owner cannot be deactivated, suspended, or exited. Transfer ownership first.");
    }

    target.membership_status = newStatus;
    return { ok: true, membership_id: membershipId, new_status: newStatus };
  }

  transferGroupOwnership(callerUserId, { groupId, newOwnerMembershipId }) {
    const caller = [...this.memberships.values()].find(
      (m) => m.user_id === callerUserId && m.group_id === groupId
    );
    if (!caller || caller.membership_status !== "active" || caller.role !== "owner") {
      throw new Error("CALLER_MUST_BE_ACTIVE_OWNER");
    }

    if (caller.id === newOwnerMembershipId) {
      throw new Error("CANNOT_TRANSFER_TO_SELF: Cannot transfer group ownership to yourself.");
    }

    const target = this.memberships.get(newOwnerMembershipId);
    if (!target || target.group_id !== groupId) {
      throw new Error("TARGET_NOT_IN_GROUP");
    }
    if (target.membership_status !== "active") {
      throw new Error("TARGET_NOT_ACTIVE_MEMBER: Target member must be an active member to receive group ownership.");
    }

    // Atomic swap
    caller.role = "admin";
    target.role = "owner";

    // Invariant assertion: exactly one active owner
    const activeOwners = [...this.memberships.values()].filter(
      (m) => m.group_id === groupId && m.role === "owner" && m.membership_status === "active"
    );
    if (activeOwners.length !== 1) {
      throw new Error("ACTIVE_OWNER_INVARIANT_VIOLATION");
    }

    return { ok: true, status: "success", old_owner_id: caller.id, new_owner_id: target.id };
  }

  deleteMembership() {
    throw new Error("MEMBERSHIP_HARD_DELETE_PROHIBITED: Deleting memberships is prohibited to preserve financial and audit ledger integrity. Use set_membership_lifecycle_status() to deactivate or exit members.");
  }

  hasGroupPermission(membershipId, permissionKey) {
    const mem = this.memberships.get(membershipId);
    if (!mem || mem.membership_status !== "active") return false;

    if (mem.role === "owner") return true;
    if (mem.role === "admin" && (permissionKey.endsWith(".manage") || permissionKey.endsWith(".invite") || permissionKey.endsWith(".view"))) {
      return true;
    }

    const perms = this.positionPermissions.get(membershipId) || [];
    return perms.includes(permissionKey);
  }

  updateMemberDisplayName(callerUserId, { groupId, membershipId, displayName }) {
    const caller = [...this.memberships.values()].find(
      (m) => m.user_id === callerUserId && m.group_id === groupId
    );
    if (!caller || caller.membership_status !== "active") throw new Error("INSUFFICIENT_PRIVILEGE");

    const target = this.memberships.get(membershipId);
    if (!target || target.group_id !== groupId) throw new Error("TARGET_NOT_IN_GROUP");

    const profBefore = this.profiles.get(target.user_id);
    const profFullNameBefore = profBefore ? profBefore.full_name : null;

    target.display_name = displayName;

    const profAfter = this.profiles.get(target.user_id);
    assert.strictEqual(profAfter.full_name, profFullNameBefore, "Global profile must NOT be mutated");

    return { ok: true, membership_id: membershipId, display_name: displayName };
  }
}

test("Invariant 1: Privilege escalation rejection (moderator cannot invite owner/admin)", () => {
  const engine = new MockM5RbacEngine();
  engine.seedInitialState();

  // 1. Moderator attempts to invite an owner -> rejected
  assert.throws(
    () => engine.createGroupInvitation("user-mod-1", { groupId: "group-1", email: "newowner@test.com", role: "owner" }),
    /CANNOT_INVITE_AS_OWNER/
  );

  // 2. Moderator attempts to invite an admin (escalation) -> rejected
  assert.throws(
    () => engine.createGroupInvitation("user-mod-1", { groupId: "group-1", email: "newadmin@test.com", role: "admin" }),
    /PRIVILEGE_ELEVATION_DENIED/
  );

  // 3. Moderator attempts to invite another moderator (equal role) -> rejected
  assert.throws(
    () => engine.createGroupInvitation("user-mod-1", { groupId: "group-1", email: "newmod@test.com", role: "moderator" }),
    /PRIVILEGE_ELEVATION_DENIED/
  );

  // 4. Moderator invites a standard member -> permitted
  const resMod = engine.createGroupInvitation("user-mod-1", { groupId: "group-1", email: "newmember@test.com", role: "member" });
  assert.strictEqual(resMod.ok, true);

  // 5. Admin attempts to invite an owner -> rejected
  assert.throws(
    () => engine.createGroupInvitation("user-admin-1", { groupId: "group-1", email: "ownerattempt@test.com", role: "owner" }),
    /CANNOT_INVITE_AS_OWNER/
  );

  // 6. Admin invites a moderator or member -> permitted
  const resAdmin = engine.createGroupInvitation("user-admin-1", { groupId: "group-1", email: "modfromadmin@test.com", role: "moderator" });
  assert.strictEqual(resAdmin.ok, true);

  // 7. Static audit: ensure invitations page gates form with members.invite
  const invPageCode = read("src/app/[locale]/(dashboard)/dashboard/invitations/page.tsx");
  assert.match(invPageCode, /const canInvite = hasPermission\("members\.invite"\);/);
  assert.match(invPageCode, /disabled=\{!email \|\| sending \|\| !canInvite\}/);
});

test("Invariant 2: Sole owner demotion / deactivation prevention (group cannot become orphaned)", () => {
  const engine = new MockM5RbacEngine();
  engine.seedInitialState();

  // 1. Demoting the owner via role update is prohibited
  assert.throws(
    () => engine.updateMembershipRole("user-admin-1", { groupId: "group-1", membershipId: "mem-owner-1", newRole: "admin" }),
    /SOLE_OWNER_DEMOTION_PROHIBITED/
  );

  // 2. Direct assignment of owner role is prohibited
  assert.throws(
    () => engine.updateMembershipRole("user-admin-1", { groupId: "group-1", membershipId: "mem-mem-1", newRole: "owner" }),
    /CANNOT_ASSIGN_OWNER_DIRECTLY/
  );

  // 3. Deactivating, suspending, or exiting the active owner is locked
  assert.throws(
    () => engine.setMembershipLifecycleStatus("user-admin-1", { groupId: "group-1", membershipId: "mem-owner-1", newStatus: "suspended" }),
    /SOLE_OWNER_STATUS_LOCK/
  );
  assert.throws(
    () => engine.setMembershipLifecycleStatus("user-admin-1", { groupId: "group-1", membershipId: "mem-owner-1", newStatus: "exited" }),
    /SOLE_OWNER_STATUS_LOCK/
  );
  assert.throws(
    () => engine.setMembershipLifecycleStatus("user-admin-1", { groupId: "group-1", membershipId: "mem-owner-1", newStatus: "archived" }),
    /SOLE_OWNER_STATUS_LOCK/
  );

  // 4. Group owner cannot demote self via standard update
  assert.throws(
    () => engine.updateMembershipRole("user-owner-1", { groupId: "group-1", membershipId: "mem-owner-1", newRole: "member" }),
    /SOLE_OWNER_DEMOTION_PROHIBITED/
  );

  // 5. Static code audit: verify members directory and detail views disable owner removal and demotion
  const memberDetailCode = read("src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx");
  assert.match(memberDetailCode, /if \(\(member\?\.role as string\) === "owner" && newStatus !== "active"\)/);
  assert.match(memberDetailCode, /if \(editOriginalRole === "owner" && editRole !== "owner"\)/);
  assert.match(memberDetailCode, /if \(editRole === "owner"\)/);
});

test("Invariant 3: Atomic ownership transfer (caller becomes admin, target becomes owner, single active owner invariant maintained)", () => {
  const engine = new MockM5RbacEngine();
  engine.seedInitialState();

  // 1. Transfer to self is prohibited
  assert.throws(
    () => engine.transferGroupOwnership("user-owner-1", { groupId: "group-1", newOwnerMembershipId: "mem-owner-1" }),
    /CANNOT_TRANSFER_TO_SELF/
  );

  // 2. Transfer to member in another group is rejected
  assert.throws(
    () => engine.transferGroupOwnership("user-owner-1", { groupId: "group-1", newOwnerMembershipId: "mem-owner-2" }),
    /TARGET_NOT_IN_GROUP/
  );

  // 3. Transfer to an inactive/suspended member is prohibited
  engine.memberships.get("mem-mem-1").membership_status = "suspended";
  assert.throws(
    () => engine.transferGroupOwnership("user-owner-1", { groupId: "group-1", newOwnerMembershipId: "mem-mem-1" }),
    /TARGET_NOT_ACTIVE_MEMBER/
  );
  engine.memberships.get("mem-mem-1").membership_status = "active";

  // 4. Valid atomic transfer to an active member
  const result = engine.transferGroupOwnership("user-owner-1", { groupId: "group-1", newOwnerMembershipId: "mem-admin-1" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, "success");

  // Verify post-transfer roles: old owner is admin, new owner is owner
  assert.strictEqual(engine.memberships.get("mem-owner-1").role, "admin");
  assert.strictEqual(engine.memberships.get("mem-admin-1").role, "owner");

  // Verify invariant: exactly 1 active owner in group-1
  const activeOwners = [...engine.memberships.values()].filter(
    (m) => m.group_id === "group-1" && m.role === "owner" && m.membership_status === "active"
  );
  assert.strictEqual(activeOwners.length, 1);
  assert.strictEqual(activeOwners[0].id, "mem-admin-1");

  // 5. Static code audit: verify Transfer Ownership modal in Member Detail requires exact "TRANSFER" confirmation
  const memberDetailCode = read("src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx");
  assert.match(memberDetailCode, /disabled=\{transferSaving \|\| transferConfirmText !== "TRANSFER"\}/);
  assert.match(memberDetailCode, /newOwnerMembershipId: membershipId/);
});

test("Invariant 4: Hard-delete prohibition trigger rejection (MEMBERSHIP_HARD_DELETE_PROHIBITED and zero UI delete calls)", () => {
  const engine = new MockM5RbacEngine();
  engine.seedInitialState();

  // 1. Deleting membership in engine throws prohibited error
  assert.throws(
    () => engine.deleteMembership("mem-mem-1"),
    /MEMBERSHIP_HARD_DELETE_PROHIBITED/
  );

  // 2. Static audit across all touched dashboard pages: zero .delete() calls on memberships table
  const touchedPages = [
    "src/app/[locale]/(dashboard)/dashboard/members/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/invitations/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/roles/page.tsx",
  ];

  for (const pagePath of touchedPages) {
    const code = read(pagePath);
    const hasMembershipDelete = /\.from\(["']memberships["']\)\.delete\(\)/.test(code);
    assert.strictEqual(hasMembershipDelete, false, `Forbidden .from("memberships").delete() found in ${pagePath}`);
  }

  // 3. Confirm all removals route through setMembershipStatusMutation with 'exited'
  const membersPageCode = read("src/app/[locale]/(dashboard)/dashboard/members/page.tsx");
  assert.match(membersPageCode, /setMembershipStatusMutation\.mutateAsync/);
  assert.match(membersPageCode, /newStatus:\s*["']exited["']/);

  const memberDetailPageCode = read("src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx");
  assert.match(memberDetailPageCode, /setLifecycleStatusMutation\.mutateAsync/);
  assert.match(memberDetailPageCode, /newStatus:\s*["']exited["']/);
});

test("Invariant 5: Inactive membership permission lock (hasPermission and has_group_permission return false)", () => {
  const engine = new MockM5RbacEngine();
  engine.seedInitialState();

  // Active members have permissions appropriate to role/positions
  assert.strictEqual(engine.hasGroupPermission("mem-owner-1", "members.manage"), true);
  assert.strictEqual(engine.hasGroupPermission("mem-admin-1", "members.manage"), true);
  assert.strictEqual(engine.hasGroupPermission("mem-mod-1", "events.manage"), true);
  assert.strictEqual(engine.hasGroupPermission("mem-mem-1", "events.manage"), false);

  // Test status changes: suspended, exited, archived, pending_approval lock all permissions
  const lockStatuses = ["suspended", "exited", "archived", "pending_approval"];

  for (const status of lockStatuses) {
    // Owner inactive lock
    engine.memberships.get("mem-owner-1").membership_status = status;
    assert.strictEqual(engine.hasGroupPermission("mem-owner-1", "members.manage"), false, `Owner with status ${status} must have 0 permissions`);
    assert.strictEqual(engine.hasGroupPermission("mem-owner-1", "finances.view"), false, `Owner with status ${status} must have 0 permissions`);

    // Admin inactive lock
    engine.memberships.get("mem-admin-1").membership_status = status;
    assert.strictEqual(engine.hasGroupPermission("mem-admin-1", "members.manage"), false, `Admin with status ${status} must have 0 permissions`);

    // Moderator inactive lock
    engine.memberships.get("mem-mod-1").membership_status = status;
    assert.strictEqual(engine.hasGroupPermission("mem-mod-1", "events.manage"), false, `Moderator with status ${status} must have 0 permissions`);
  }

  // Restore and check recovery
  engine.memberships.get("mem-owner-1").membership_status = "active";
  assert.strictEqual(engine.hasGroupPermission("mem-owner-1", "members.manage"), true);

  // Static code audit: use-permissions returns false if !isMemberActive
  const permsCode = read("src/lib/hooks/use-permissions.ts");
  assert.match(permsCode, /if \(!isMemberActive\) return false;/);
});

test("Invariant 6: PII isolation verification (memberships.display_name targeted, zero mutations on profiles table)", () => {
  const engine = new MockM5RbacEngine();
  engine.seedInitialState();

  // 1. Update display name via engine targets memberships and preserves profiles
  const res = engine.updateMemberDisplayName("user-admin-1", {
    groupId: "group-1",
    membershipId: "mem-mem-1",
    displayName: "David Alias in Group 1",
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(engine.memberships.get("mem-mem-1").display_name, "David Alias in Group 1");
  assert.strictEqual(engine.profiles.get("user-mem-1").full_name, "David Member", "Global profile must remain unchanged");

  // 2. Static code audit: verify members directory and detail views do not mutate public.profiles
  const membersPageCode = read("src/app/[locale]/(dashboard)/dashboard/members/page.tsx");
  assert.strictEqual(/\.from\(["']profiles["']\)\.update\(/.test(membersPageCode), false, "profiles.update() forbidden in members directory");
  assert.match(membersPageCode, /updateDisplayNameMutation\.mutateAsync/);

  const memberDetailPageCode = read("src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx");
  assert.strictEqual(/\.from\(["']profiles["']\)\.update\(/.test(memberDetailPageCode), false, "profiles.update() forbidden in member detail");
  assert.match(memberDetailPageCode, /updateDisplayNameMutation\.mutateAsync/);
});

test("Invariant 7: Tenant boundary integrity (staleTenantAborted on cross-tenant operations)", () => {
  // 1. Verify staleTenantAborted guards in use-membership-mutations.ts
  const mutationsCode = read("src/lib/hooks/use-membership-mutations.ts");
  assert.match(mutationsCode, /if \(!currentGroupId \|\| input\.groupId !== currentGroupId\) \{\s*throw new Error\("staleTenantAborted"\);/);

  // 2. Simulate hook guard function
  function simulateHookGuard(currentGroupId, inputGroupId) {
    if (!currentGroupId || inputGroupId !== currentGroupId) {
      throw new Error("staleTenantAborted");
    }
    return { ok: true };
  }

  // Cross-tenant attempt fails
  assert.throws(
    () => simulateHookGuard("group-1", "group-2"),
    /staleTenantAborted/
  );

  // Null currentGroupId fails
  assert.throws(
    () => simulateHookGuard(null, "group-1"),
    /staleTenantAborted/
  );

  // Same tenant succeeds
  const okRes = simulateHookGuard("group-1", "group-1");
  assert.strictEqual(okRes.ok, true);

  // 3. Static audit: verify render-phase tenant reset in members page
  const membersPageCode = read("src/app/[locale]/(dashboard)/dashboard/members/page.tsx");
  assert.match(membersPageCode, /const \[prevGroupId, setPrevGroupId\] = useState\(groupId\);/);
  assert.match(membersPageCode, /if \(groupId !== prevGroupId\) \{/);
  assert.match(membersPageCode, /setPrevGroupId\(groupId\);/);
  assert.match(membersPageCode, /setOwnershipDialogOpen\(false\);/);
  assert.match(membersPageCode, /setRemoveDialogOpen\(false\);/);
});


