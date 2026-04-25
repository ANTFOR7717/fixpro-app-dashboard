import { Search, Users, Shield, User, UserPlus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/design-systems/shadcn/components/select";
import { adminConfig } from "@/features/user-management/config/admin-config";

interface UsersTableToolbarProps {
  email: string;
  role: string;
  setEmail: (email: string) => void;
  setRole: (role: string) => void;
  setPage: (page: number) => void;
  onAddUserClick: () => void;
}

export function UsersTableToolbar({
  email,
  role,
  setEmail,
  setRole,
  setPage,
  onAddUserClick,
}: UsersTableToolbarProps) {
  const config = adminConfig.pages.users.table;

  return (
    <div className="flex flex-wrap gap-2 items-end mb-2 w-full justify-between">
      <div className="flex gap-2 items-end">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={config.searchPlaceholder}
            className="pl-8 pr-2 py-2 border rounded-md text-sm bg-background w-[200px]"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px] flex items-center gap-2">
            <span className="flex items-center gap-2">
              {role === "all" ? (
                <Users className="w-4 h-4" />
              ) : role === "admin" ? (
                <Shield className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
              {config.roleOptions.find((o) => o.value === role)?.label || role}
            </span>
          </SelectTrigger>
          <SelectContent>
            {config.roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-2">
                  {option.value === "all" ? (
                    <Users className="w-4 h-4" />
                  ) : option.value === "admin" ? (
                    <Shield className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <button
        className="ml-auto bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium shadow-xs hover:bg-primary/90 transition-colors flex items-center gap-2"
        onClick={onAddUserClick}
      >
        <UserPlus className="h-4 w-4" />
        {config.addUserLabel}
      </button>
    </div>
  );
}
