"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { createUser } from "@/features/user-management/api/admin-actions";
import { Label } from "@/design-systems/shadcn/components/label";
import { Input } from "@/design-systems/shadcn/components/input";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-systems/shadcn/components/select";

import { Switch } from "@/design-systems/shadcn/components/switch";
import { adminConfig } from "@/features/user-management/config/admin-config";

interface UserAddDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function UserAddDialog({
  isOpen,
  onClose,
  onSuccess,
}: UserAddDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "user" as "user" | "admin",
    autoVerify: false,
  });

  const handleCreateUser = async () => {
    try {
      setIsLoading(true);
      await createUser(formData);
      const conf = adminConfig.pages.users.addDialog;
      toast.success(
        formData.autoVerify ? conf.successVerified : conf.successUnverified
      );
      onSuccess?.();
      onClose();
      // Reset form
      setFormData({
        name: "",
        email: "",
        password: "",
        role: "user",
        autoVerify: false,
      });
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const conf = adminConfig.pages.users.addDialog;
  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleCreateUser}
      title={conf.title}
      description={conf.description}
      confirmText={isLoading ? conf.confirmingText : conf.confirmText}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">{conf.nameLabel}</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder={conf.namePlaceholder}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">{conf.emailLabel}</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder={conf.emailPlaceholder}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{conf.passwordLabel}</Label>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, password: e.target.value }))
            }
            placeholder={conf.passwordPlaceholder}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="role">{conf.roleLabel}</Label>
          <Select
            value={formData.role}
            onValueChange={(value: "user" | "admin") =>
              setFormData((prev) => ({ ...prev, role: value }))
            }
          >
            <SelectTrigger id="role" className="w-full">
              <SelectValue placeholder={conf.rolePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {adminConfig.pages.users.roleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="autoVerify" className="cursor-pointer">
            {conf.autoVerifyLabel}
          </Label>
          <Switch
            id="autoVerify"
            checked={formData.autoVerify}
            onCheckedChange={(checked: boolean) =>
              setFormData((prev) => ({ ...prev, autoVerify: checked }))
            }
          />
        </div>
      </div>
    </ConfirmationDialog>
  );
}
