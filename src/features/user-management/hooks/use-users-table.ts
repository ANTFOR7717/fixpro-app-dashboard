"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useUsersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [role, setRole] = useState(searchParams.get("role") || "all");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [debouncedEmail, setDebouncedEmail] = useState(email);
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const limit = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEmail(email), 300);
    return () => clearTimeout(timer);
  }, [email]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (role && role !== "all") params.set("role", role);
    if (debouncedEmail) params.set("email", debouncedEmail);
    if (page) params.set("page", String(page));
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
  }, [role, debouncedEmail, page, router]);

  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    if (role && role !== "all") params.set("role", role);
    if (debouncedEmail) params.set("email", debouncedEmail);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return `/api/admin/users?${params.toString()}`;
  }, [role, debouncedEmail, page, limit]);

  const { data, error, mutate, isLoading } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  return {
    state: { role, email, page, limit },
    mutators: { setRole, setEmail, setPage, mutate },
    data,
    error,
    isLoading,
  };
}
