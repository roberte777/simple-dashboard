"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Key, Shield } from "lucide-react";
import type { AuthMethod } from "@/lib/types";

interface AuthMethodSelectProps {
  authMethod: AuthMethod;
  onAuthMethodChange: (method: AuthMethod) => void;
  patAvailable: boolean;
  patError: string | null;
}

export function AuthMethodSelect({
  authMethod,
  onAuthMethodChange,
  patAvailable,
  patError,
}: AuthMethodSelectProps) {
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={authMethod}
        onValueChange={(v) => onAuthMethodChange(v as AuthMethod)}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="oauth">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              OAuth
            </div>
          </SelectItem>
          <SelectItem value="pat" disabled={!patAvailable}>
            <div className="flex items-center gap-1.5">
              <Key className="h-3 w-3" />
              PAT
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
      {patError && (
        <Alert variant="destructive" className="py-2 px-3">
          <AlertCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">{patError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
