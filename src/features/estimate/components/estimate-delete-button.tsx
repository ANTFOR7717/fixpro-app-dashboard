"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Trash2 } from "lucide-react";
import { Button } from "@/design-systems/shadcn/components/button";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import { deleteEstimateAction } from "../api/actions";

interface EstimateDeleteButtonProps {
  id: string;
  fileName: string;
}

export function EstimateDeleteButton({ id, fileName }: EstimateDeleteButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", id);
      const result = await deleteEstimateAction(null, formData);
      if (result.success) toast.success(result.message ?? "Estimate deleted.");
      else toast.error(result.error ?? "Failed to delete estimate.");
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        className="gap-1.5"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {isPending ? "Deleting..." : "Delete"}
      </Button>
      <ConfirmationDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title={`Delete "${fileName}"?`}
        description="This will permanently remove the estimate row and its uploaded PDF. This cannot be undone."
        confirmText={isPending ? "Deleting..." : "Delete"}
        confirmVariant="destructive"
      />
    </>
  );
}
