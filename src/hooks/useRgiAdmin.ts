import { useAuth } from "@/hooks/useAuth";

export function useIsRgiAdmin(): boolean {
  const { profile } = useAuth();
  return profile?.role === "admin";
}
