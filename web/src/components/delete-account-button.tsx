"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteAccountButton() {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
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
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 cursor-pointer transition-colors"
      >
        Delete account
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete your account?"
        description="Your account, chats, and all associated data will be permanently deleted. This cannot be undone."
        confirmLabel="Delete forever"
        busyLabel="Deleting..."
        busy={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
