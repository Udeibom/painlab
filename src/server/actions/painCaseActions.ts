"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPainCaseSchema, updatePainCaseSchema } from "../validation/painCase";
import { createPainCase, updatePainCase } from "../services/painCaseService";

export async function createPainCaseAction(formData: FormData) {
  const raw = {
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    importance: (formData.get("importance") as string) || "MEDIUM",
  };

  const parsed = createPainCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const painCase = await createPainCase(parsed.data);
  revalidatePath("/");
  redirect(`/cases/${painCase.id}`);
}

export async function updatePainCaseAction(formData: FormData) {
  const raw = {
    id: formData.get("id") as string,
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    status: formData.get("status") as string,
    importance: formData.get("importance") as string,
    tags: formData
      .get("tags")
      ?.toString()
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };

  const parsed = updatePainCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  await updatePainCase(parsed.data);
  revalidatePath(`/cases/${parsed.data.id}`);
  revalidatePath("/");
}
