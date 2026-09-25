"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { logActivity } from "@/lib/audit-log";

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export type FinancialAccountKind =
  | "bank"
  | "cash"
  | "mobile_money"
  | "wallet"
  | "other";

export type FinancialAccountStatus = "active" | "inactive" | "closed";

export type FinancialConfigStatus = "active" | "inactive";

export type FinancialCategoryClass = "income" | "expense";

export interface FinancialLedgerEpoch {
  id: string;
  group_id: string;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  source_kind: string;
  source_reference: string | null;
  approval_note: string;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string;
  created_at: string;
}

export interface FinancialAccount {
  id: string;
  group_id: string;
  opened_ledger_epoch_id: string;
  currency: string;
  name: string;
  description: string | null;
  kind: FinancialAccountKind;
  status: FinancialAccountStatus;
  inactive_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  opened_at: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialFund {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  is_restricted: boolean;
  is_default: boolean;
  status: FinancialConfigStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialCategory {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  category_class: FinancialCategoryClass;
  is_system: boolean;
  status: FinancialConfigStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFinancialAccountInput {
  groupId: string;
  name: string;
  kind: FinancialAccountKind;
  description?: string | null;
  openedLedgerEpochId?: string;
  currency?: string;
}

export interface UpdateFinancialAccountInput {
  id: string;
  groupId: string;
  name?: string;
  description?: string | null;
  status?: FinancialAccountStatus;
}

export interface CreateFinancialFundInput {
  groupId: string;
  name: string;
  description?: string | null;
  is_restricted?: boolean;
  is_default?: boolean;
}

export interface UpdateFinancialFundInput {
  id: string;
  groupId: string;
  name?: string;
  description?: string | null;
  status?: FinancialConfigStatus;
  is_default?: boolean;
}

export interface CreateFinancialCategoryInput {
  groupId: string;
  name: string;
  category_class: FinancialCategoryClass;
  description?: string | null;
}

export interface UpdateFinancialCategoryInput {
  id: string;
  groupId: string;
  name?: string;
  description?: string | null;
  status?: FinancialConfigStatus;
}

// ─── QUERY HOOKS ─────────────────────────────────────────────────────────────

/**
 * Fetches the currently active ledger epoch (`effective_to IS NULL`) for a group.
 * Required when opening a new financial account.
 */
export function useActiveLedgerEpoch(groupId: string | null) {
  return useQuery({
    queryKey: ["financial-active-epoch", groupId],
    queryFn: async (): Promise<FinancialLedgerEpoch | null> => {
      if (!groupId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("financial_ledger_epochs")
        .select("*")
        .eq("group_id", groupId)
        .is("effective_to", null)
        .maybeSingle();

      if (error) {
        console.error("[useActiveLedgerEpoch] Query failed:", error.message);
        throw error;
      }
      return (data as FinancialLedgerEpoch | null) ?? null;
    },
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Queries all financial accounts for a group, ordered by name ASC.
 */
export function useFinancialAccounts(groupId: string | null) {
  return useQuery({
    queryKey: ["financial-accounts", groupId],
    queryFn: async (): Promise<FinancialAccount[]> => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("*")
        .eq("group_id", groupId)
        .order("name", { ascending: true });

      if (error) {
        console.error("[useFinancialAccounts] Query failed:", error.message);
        throw error;
      }
      return (data as FinancialAccount[]) ?? [];
    },
    enabled: !!groupId,
  });
}

/**
 * Queries all financial funds for a group, ordered with default fund first (`is_default DESC`), then name ASC.
 */
export function useFinancialFunds(groupId: string | null) {
  return useQuery({
    queryKey: ["financial-funds", groupId],
    queryFn: async (): Promise<FinancialFund[]> => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("financial_funds")
        .select("*")
        .eq("group_id", groupId)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (error) {
        console.error("[useFinancialFunds] Query failed:", error.message);
        throw error;
      }
      return (data as FinancialFund[]) ?? [];
    },
    enabled: !!groupId,
  });
}

/**
 * Queries all financial categories for a group, ordered by class (income first, expense second), then name ASC.
 */
export function useFinancialCategories(groupId: string | null) {
  return useQuery({
    queryKey: ["financial-categories", groupId],
    queryFn: async (): Promise<FinancialCategory[]> => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("financial_categories")
        .select("*")
        .eq("group_id", groupId)
        .order("category_class", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("[useFinancialCategories] Query failed:", error.message);
        throw error;
      }
      return (data as FinancialCategory[]) ?? [];
    },
    enabled: !!groupId,
  });
}

/**
 * Preflight query checking whether an account has zero balance and can be closed.
 * Sums all signed postings for this account.
 */
export function useAccountBalancePreflight(groupId: string | null, accountId: string | null) {
  return useQuery({
    queryKey: ["financial-account-balance-preflight", groupId, accountId],
    queryFn: async () => {
      if (!groupId || !accountId) return { balance: 0, canClose: false, postingsCount: 0 };
      const supabase = createClient();
      const { data, error } = await supabase
        .from("financial_postings")
        .select("amount_signed")
        .eq("group_id", groupId)
        .eq("account_id", accountId);

      if (error) {
        console.error("[useAccountBalancePreflight] Query failed:", error.message);
        throw error;
      }

      const postings = data || [];
      const balance = postings.reduce((sum, p) => sum + Number(p.amount_signed || 0), 0);
      const canClose = Math.abs(balance) < 0.000001;

      return {
        balance,
        canClose,
        postingsCount: postings.length,
      };
    },
    enabled: !!groupId && !!accountId,
  });
}

// ─── MUTATION HOOKS ──────────────────────────────────────────────────────────

/**
 * Creates a new financial account.
 * - Validates current tenant match (`currentGroupId === formGroupId`)
 * - Binds the active ledger epoch ID and currency
 * - Enforces DB lifecycle start (status: active)
 * - Records audit activity
 */
export function useCreateFinancialAccount() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId, user } = useGroup();

  return useMutation({
    mutationFn: async (input: CreateFinancialAccountInput): Promise<FinancialAccount> => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("Stale tenant detected: active group does not match form target");
      }

      const trimmedName = input.name.trim();
      if (!trimmedName || trimmedName.length > 120) {
        throw new Error("Account name must be between 1 and 120 characters");
      }

      const supabase = createClient();

      // Resolve active epoch & currency if not explicitly supplied
      let epochId = input.openedLedgerEpochId;
      let currency = input.currency;

      if (!epochId || !currency) {
        const { data: activeEpoch, error: epochErr } = await supabase
          .from("financial_ledger_epochs")
          .select("id, currency")
          .eq("group_id", input.groupId)
          .is("effective_to", null)
          .maybeSingle();

        if (epochErr || !activeEpoch) {
          throw new Error("No active financial ledger epoch found for this group. An active epoch is required to open an account.");
        }
        epochId = activeEpoch.id as string;
        currency = activeEpoch.currency as string;
      }

      if (!epochId || !currency) {
        throw new Error("Active ledger epoch ID and currency are required to open an account.");
      }

      const { data, error } = await supabase
        .from("financial_accounts")
        .insert({
          group_id: input.groupId,
          opened_ledger_epoch_id: epochId,
          currency: currency.toUpperCase(),
          name: trimmedName,
          description: input.description?.trim() || null,
          kind: input.kind,
          status: "active",
          created_by: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      await logActivity(supabase, {
        groupId: input.groupId,
        action: "financial_account.created",
        entityType: "financial_account",
        entityId: data.id,
        description: `Financial account "${data.name}" (${data.kind}) created`,
        metadata: { name: data.name, kind: data.kind, currency: data.currency },
      });

      return data as FinancialAccount;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["financial-accounts", variables.groupId] });
    },
  });
}

/**
 * Updates a financial account (name, description, status).
 * - Enforces forward-only status updates (active → inactive → closed)
 * - Performs balance preflight before allowing closed transition
 * - Records audit activity
 */
export function useUpdateFinancialAccount() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation({
    mutationFn: async (input: UpdateFinancialAccountInput): Promise<FinancialAccount> => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("Stale tenant detected: active group does not match form target");
      }

      const supabase = createClient();

      // Fetch existing row to check current lifecycle status
      const { data: existing, error: fetchErr } = await supabase
        .from("financial_accounts")
        .select("*")
        .eq("id", input.id)
        .eq("group_id", input.groupId)
        .single();

      if (fetchErr || !existing) {
        throw new Error("Financial account not found");
      }

      // Validate lifecycle transitions if status change requested
      if (input.status && input.status !== existing.status) {
        if (existing.status === "active" && input.status !== "inactive") {
          throw new Error("Active accounts may only transition to inactive.");
        }
        if (existing.status === "inactive" && input.status !== "closed") {
          throw new Error("Inactive accounts may only transition to closed.");
        }
        if (existing.status === "closed") {
          throw new Error("Closed accounts cannot undergo further status transitions.");
        }

        // Account-close preflight assertion: verify balance is zero
        if (input.status === "closed") {
          const { data: postings, error: postErr } = await supabase
            .from("financial_postings")
            .select("amount_signed")
            .eq("group_id", input.groupId)
            .eq("account_id", input.id);

          if (postErr) throw postErr;
          const balance = (postings || []).reduce((sum, p) => sum + Number(p.amount_signed || 0), 0);
          if (Math.abs(balance) > 0.000001) {
            throw new Error("Cannot close account: account balance must be exactly zero before closing.");
          }
        }
      }

      const updatePayload: Record<string, unknown> = {};
      if (input.name !== undefined) {
        const trimmed = input.name.trim();
        if (!trimmed || trimmed.length > 120) {
          throw new Error("Account name must be between 1 and 120 characters");
        }
        updatePayload.name = trimmed;
      }
      if (input.description !== undefined) {
        updatePayload.description = input.description?.trim() || null;
      }
      if (input.status !== undefined) {
        updatePayload.status = input.status;
      }

      const { data, error } = await supabase
        .from("financial_accounts")
        .update(updatePayload)
        .eq("id", input.id)
        .eq("group_id", input.groupId)
        .select()
        .single();

      if (error) throw error;

      await logActivity(supabase, {
        groupId: input.groupId,
        action: "financial_account.updated",
        entityType: "financial_account",
        entityId: data.id,
        description: `Financial account "${data.name}" updated (status: ${data.status})`,
        metadata: updatePayload,
      });

      return data as FinancialAccount;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["financial-accounts", variables.groupId] });
      queryClient.invalidateQueries({
        queryKey: ["financial-account-balance-preflight", variables.groupId, variables.id],
      });
    },
  });
}

/**
 * Creates a new financial fund.
 * - Validates current tenant match
 * - Enforces single default fund rule and unrestricted default fund invariant
 * - Records audit activity
 */
export function useCreateFinancialFund() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId, user } = useGroup();

  return useMutation({
    mutationFn: async (input: CreateFinancialFundInput): Promise<FinancialFund> => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("Stale tenant detected: active group does not match form target");
      }

      const trimmedName = input.name.trim();
      if (!trimmedName || trimmedName.length > 120) {
        throw new Error("Fund name must be between 1 and 120 characters");
      }

      const supabase = createClient();

      // Check default fund constraints
      if (input.is_default) {
        if (input.is_restricted) {
          throw new Error("The default fund cannot be restricted.");
        }

        const { data: existingDefault } = await supabase
          .from("financial_funds")
          .select("id, name")
          .eq("group_id", input.groupId)
          .eq("is_default", true)
          .maybeSingle();

        if (existingDefault) {
          throw new Error(`Another fund ("${existingDefault.name}") is already designated as the default fund.`);
        }
      }

      const { data, error } = await supabase
        .from("financial_funds")
        .insert({
          group_id: input.groupId,
          name: trimmedName,
          description: input.description?.trim() || null,
          is_restricted: input.is_restricted ?? false,
          is_default: input.is_default ?? false,
          status: "active",
          created_by: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      await logActivity(supabase, {
        groupId: input.groupId,
        action: "financial_fund.created",
        entityType: "financial_fund",
        entityId: data.id,
        description: `Financial fund "${data.name}" created (default: ${data.is_default}, restricted: ${data.is_restricted})`,
        metadata: { name: data.name, is_default: data.is_default, is_restricted: data.is_restricted },
      });

      return data as FinancialFund;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["financial-funds", variables.groupId] });
    },
  });
}

/**
 * Updates a financial fund (name, description, status, is_default).
 * - Enforces single default fund invariant and non-restricted default rule
 * - Prevents inactivating the active default fund
 * - Records audit activity
 */
export function useUpdateFinancialFund() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation({
    mutationFn: async (input: UpdateFinancialFundInput): Promise<FinancialFund> => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("Stale tenant detected: active group does not match form target");
      }

      const supabase = createClient();

      const { data: existing, error: fetchErr } = await supabase
        .from("financial_funds")
        .select("*")
        .eq("id", input.id)
        .eq("group_id", input.groupId)
        .single();

      if (fetchErr || !existing) {
        throw new Error("Financial fund not found");
      }

      // Check status transition: only active -> inactive is permitted by DB trigger
      if (input.status && input.status !== existing.status) {
        if (existing.status !== "active" || input.status !== "inactive") {
          throw new Error("Invalid fund status transition: only active funds may be inactivated.");
        }
        if (existing.is_default) {
          throw new Error("The default fund cannot be inactivated. Designate another active, unrestricted fund as default first.");
        }
      }

      // If designating this fund as default
      if (input.is_default === true) {
        if (existing.is_restricted) {
          throw new Error("Restricted funds cannot be set as the default fund.");
        }
        if ((input.status ?? existing.status) === "inactive") {
          throw new Error("Inactive funds cannot be set as the default fund.");
        }

        // Unset any other default fund first to satisfy the unique partial index
        const { error: unsetErr } = await supabase
          .from("financial_funds")
          .update({ is_default: false })
          .eq("group_id", input.groupId)
          .eq("is_default", true)
          .neq("id", input.id);

        if (unsetErr) throw unsetErr;
      }

      const updatePayload: Record<string, unknown> = {};
      if (input.name !== undefined) {
        const trimmed = input.name.trim();
        if (!trimmed || trimmed.length > 120) {
          throw new Error("Fund name must be between 1 and 120 characters");
        }
        updatePayload.name = trimmed;
      }
      if (input.description !== undefined) {
        updatePayload.description = input.description?.trim() || null;
      }
      if (input.status !== undefined) {
        updatePayload.status = input.status;
      }
      if (input.is_default !== undefined) {
        updatePayload.is_default = input.is_default;
      }

      const { data, error } = await supabase
        .from("financial_funds")
        .update(updatePayload)
        .eq("id", input.id)
        .eq("group_id", input.groupId)
        .select()
        .single();

      if (error) throw error;

      await logActivity(supabase, {
        groupId: input.groupId,
        action: "financial_fund.updated",
        entityType: "financial_fund",
        entityId: data.id,
        description: `Financial fund "${data.name}" updated`,
        metadata: updatePayload,
      });

      return data as FinancialFund;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["financial-funds", variables.groupId] });
    },
  });
}

/**
 * Creates a new financial category (income or expense).
 * - System categories cannot be created by users (always is_system = false)
 * - Records audit activity
 */
export function useCreateFinancialCategory() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId, user } = useGroup();

  return useMutation({
    mutationFn: async (input: CreateFinancialCategoryInput): Promise<FinancialCategory> => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("Stale tenant detected: active group does not match form target");
      }

      const trimmedName = input.name.trim();
      if (!trimmedName || trimmedName.length > 120) {
        throw new Error("Category name must be between 1 and 120 characters");
      }

      if (input.category_class !== "income" && input.category_class !== "expense") {
        throw new Error("Category class must be 'income' or 'expense'");
      }

      const supabase = createClient();

      const { data, error } = await supabase
        .from("financial_categories")
        .insert({
          group_id: input.groupId,
          name: trimmedName,
          category_class: input.category_class,
          description: input.description?.trim() || null,
          is_system: false,
          status: "active",
          created_by: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      await logActivity(supabase, {
        groupId: input.groupId,
        action: "financial_category.created",
        entityType: "financial_category",
        entityId: data.id,
        description: `Financial category "${data.name}" (${data.category_class}) created`,
        metadata: { name: data.name, category_class: data.category_class },
      });

      return data as FinancialCategory;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["financial-categories", variables.groupId] });
    },
  });
}

/**
 * Updates a financial category (name, description, status).
 * - Protects system categories from modification or inactivation
 * - Enforces active -> inactive transition only
 * - Records audit activity
 */
export function useUpdateFinancialCategory() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation({
    mutationFn: async (input: UpdateFinancialCategoryInput): Promise<FinancialCategory> => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("Stale tenant detected: active group does not match form target");
      }

      const supabase = createClient();

      const { data: existing, error: fetchErr } = await supabase
        .from("financial_categories")
        .select("*")
        .eq("id", input.id)
        .eq("group_id", input.groupId)
        .single();

      if (fetchErr || !existing) {
        throw new Error("Financial category not found");
      }

      // Protected invariant: system categories cannot be modified or inactivated
      if (existing.is_system) {
        throw new Error("System categories cannot be modified or inactivated.");
      }

      // Check status transition: only active -> inactive is permitted by DB trigger
      if (input.status && input.status !== existing.status) {
        if (existing.status !== "active" || input.status !== "inactive") {
          throw new Error("Invalid category status transition: only active categories may be inactivated.");
        }
      }

      const updatePayload: Record<string, unknown> = {};
      if (input.name !== undefined) {
        const trimmed = input.name.trim();
        if (!trimmed || trimmed.length > 120) {
          throw new Error("Category name must be between 1 and 120 characters");
        }
        updatePayload.name = trimmed;
      }
      if (input.description !== undefined) {
        updatePayload.description = input.description?.trim() || null;
      }
      if (input.status !== undefined) {
        updatePayload.status = input.status;
      }

      const { data, error } = await supabase
        .from("financial_categories")
        .update(updatePayload)
        .eq("id", input.id)
        .eq("group_id", input.groupId)
        .select()
        .single();

      if (error) throw error;

      await logActivity(supabase, {
        groupId: input.groupId,
        action: "financial_category.updated",
        entityType: "financial_category",
        entityId: data.id,
        description: `Financial category "${data.name}" updated`,
        metadata: updatePayload,
      });

      return data as FinancialCategory;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["financial-categories", variables.groupId] });
    },
  });
}
