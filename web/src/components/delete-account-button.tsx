"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export function DeleteAccountButton() {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(
        "Permanently delete your account and all data? This cannot be undone."
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Account deleted");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Failed to delete account. Please try again.");
      setIsDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 cursor-pointer transition-colors"
    >
      {isDeleting ? "Deleting..." : "Delete account"}
    </button>
  );
}
