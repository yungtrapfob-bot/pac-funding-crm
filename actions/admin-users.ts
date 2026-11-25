"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CreateUserFormState } from "@/actions/admin-users-form-state";

const passwordSchema = z.string().min(12).max(72);
const creationSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  confirmPassword: z.string(),
});

export async function createRepUserAction(
  _: CreateUserFormState,
  formData: FormData,
): Promise<CreateUserFormState> {
  await requireRole(["admin"]);
  const parsed = creationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) {
    return { status: "error", message: "Enter a valid name and email, and matching passwords of 12–72 characters." };
  }

  const { fullName, email, password } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { status: "error", message: error?.message ?? "Could not create the Auth account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name: fullName,
    email,
    role: "rep",
  });
  if (profileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
    if (cleanupError) console.error("[users] Could not remove newly created Auth account", { id: data.user.id, code: cleanupError.code });
    return {
      status: "error",
      message: cleanupError
        ? "CRM profile setup failed. Ask a Supabase administrator to inspect the new Auth account before retrying."
        : "CRM profile setup failed. The new Auth account was removed.",
    };
  }

  revalidatePath("/admin/users");
  return { status: "success", message: `Rep account created for ${email}.` };
}

export async function manageRepUserAction(
  _: CreateUserFormState,
  formData: FormData,
): Promise<CreateUserFormState> {
  await requireRole(["admin"]);
  const id = z.string().uuid().safeParse(formData.get("user_id"));
  const operation = z.enum(["reset_password", "activate", "deactivate", "reassign"]).safeParse(formData.get("operation"));
  if (!id.success || !operation.success) return { status: "error", message: "Choose a rep and a valid action." };

  const supabase = await createClient();
  const { data: rep, error: lookupError } = await supabase.from("profiles").select("role").eq("id", id.data).maybeSingle();
  if (lookupError || rep?.role !== "rep") return { status: "error", message: "This action is available for rep accounts only." };

  if (operation.data === "reassign") {
    const recipient = z.string().uuid().safeParse(formData.get("recipient"));
    if (!recipient.success || recipient.data === id.data) return { status: "error", message: "Choose a different active rep." };
    const { data: count, error } = await supabase.rpc("crm_reassign_leads", { source_rep: id.data, target_rep: recipient.data });
    if (error) return { status: "error", message: "Could not reassign active leads. Verify that the destination rep is active." };
    revalidatePath("/hot-leads");
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { status: "success", message: `${count} active leads reassigned.` };
  }

  const admin = createAdminClient();
  if (operation.data === "reset_password") {
    const password = passwordSchema.safeParse(formData.get("password"));
    if (!password.success || password.data !== formData.get("confirmPassword")) {
      return { status: "error", message: "Enter matching passwords of 12–72 characters." };
    }
    const { error } = await admin.auth.admin.updateUserById(id.data, { password: password.data });
    return error ? { status: "error", message: "Supabase could not reset the password." }
      : { status: "success", message: "Password updated." };
  }

  const active = operation.data === "activate";
  // The profile flag gates every CRM data access, including existing sessions.
  if (!active) {
    const { error } = await admin.from("profiles").update({ is_active: false }).eq("id", id.data).eq("role", "rep");
    if (error) return { status: "error", message: "Could not suspend CRM access." };
    revalidatePath("/admin/users");
  }

  const { error: authError } = await admin.auth.admin.updateUserById(id.data, { ban_duration: active ? "none" : "876000h" });
  if (authError) return { status: "error", message: active ? "Supabase could not reactivate sign-in." : "CRM access is suspended. Supabase could not also suspend sign-in. Retry deactivation." };

  if (active) {
    const { error } = await admin.from("profiles").update({ is_active: true }).eq("id", id.data).eq("role", "rep");
    if (error) return { status: "error", message: "Sign-in was enabled but CRM access remains suspended. Retry activation." };
  }
  revalidatePath("/admin/users");
  return { status: "success", message: active ? "Rep activated." : "Rep deactivated. CRM access is suspended for existing sessions." };
}
