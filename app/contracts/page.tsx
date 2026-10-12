"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActionIcon, Alert, Button, Container, Stack } from "@mantine/core";
import { IconAlertTriangle, IconFileText, IconPlus, IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { NewSignatureRequestWizard } from "@/components/signature-request/NewSignatureRequestWizard";
import { ConfirmSheet, EmptyState, ListSkeleton, PageHeader, StatTiles } from "@/components/ui";
import { ContractRow } from "@/components/contracts/ContractRow";
import { ContractsFilterBar } from "@/components/contracts/ContractsFilterBar";
import { PendingActivationSection } from "@/components/contracts/PendingActivationSection";
import { SubscriptionBanner } from "@/components/contracts/SubscriptionBanner";
import {
  contractStats, filterContracts, matchesStatus,
  type ContractListItem, type ContractStatusFilter,
} from "@/lib/contracts/listModel";

export default function ContractsPage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ContractStatusFilter>("todos");
  const [subscription, setSubscription] = useState<any>(null);
  const [wizardContractId, setWizardContractId] = useState<string | null>(null);
  const [toArchive, setToArchive] = useState<ContractListItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      const res = await fetch("/api/contracts");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error al cargar contratos");
      setContracts((await res.json()).contracts || []);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching contracts:", err);
      setError(err.message || "Error al cargar contratos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      load();
      fetch("/api/subscription")
        .then((r) => (r.ok ? r.json() : null))
        .then(setSubscription)
        .catch(() => {});
    } else if (sessionStatus === "unauthenticated") router.push("/auth/signin");
  }, [sessionStatus, load, router]);

  const contractLimit = subscription?.usageLimits?.find((l: any) => l.type === "contracts");
  const newContract = () => {
    if (contractLimit?.exceeded) {
      notifications.show({
        title: "Límite alcanzado",
        message: `Has alcanzado el límite de contratos para tu plan (${contractLimit.current}/${contractLimit.limit}). Para crear más contratos, mejora tu plan o espera al próximo mes.`,
        color: "orange",
        autoClose: 8000,
      });
      return;
    }
    router.push("/contracts/new");
  };

  const onActivated = (id: string) =>
    setContracts((cur) => cur.map((c) => (c.id === id ? { ...c, status: "active", pendingActivation: false } : c)));

  const confirmArchive = async () => {
    if (!toArchive) return;
    setArchiving(true);
    try {
      // DELETE only accepts drafts; the status endpoint archives any contract.
      const res = await fetch(`/api/contracts/${toArchive.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error al archivar el contrato");
      setContracts((cur) => cur.filter((c) => c.id !== toArchive.id));
      notifications.show({ title: "Contrato archivado", message: `«${toArchive.name}» se ha archivado`, color: "green" });
      setToArchive(null);
    } catch (err: any) {
      notifications.show({ title: "Error", message: err.message || "No se pudo archivar el contrato", color: "red" });
    } finally {
      setArchiving(false);
    }
  };

  const handlers = { onRequest: (c: ContractListItem) => setWizardContractId(c.id), onArchive: setToArchive, onActivated };
  const stats = useMemo(() => contractStats(contracts), [contracts]);
  const counts = useMemo(() => ({
    todos: contracts.length,
    active: contracts.filter((c) => matchesStatus(c, "active")).length,
    draft: contracts.filter((c) => matchesStatus(c, "draft")).length,
    pending: contracts.filter((c) => matchesStatus(c, "pending")).length,
  }), [contracts]);
  const filtered = useMemo(() => filterContracts(contracts, { query, status }), [contracts, query, status]);
  // In "Todos" the pending library contracts get their own section on top instead of being mixed in.
  const pending = status === "todos" ? filtered.filter((c) => c.pendingActivation) : [];
  const list = status === "todos" ? filtered.filter((c) => !c.pendingActivation) : filtered;
  const setFilter = (s: ContractStatusFilter) => setStatus(s === status && s !== "todos" ? "todos" : s);

  return (
    <>
      <PageHeader
        title="Contratos"
        large
        actions={
          <>
            <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Actualizar" onClick={() => load(true)} loading={refreshing}>
              <IconRefresh size={22} />
            </ActionIcon>
            <ActionIcon hiddenFrom="sm" variant="filled" size="lg" aria-label="Nuevo contrato" onClick={newContract}>
              <IconPlus size={22} />
            </ActionIcon>
            <Button visibleFrom="sm" leftSection={<IconPlus size={18} />} onClick={newContract}>
              Nuevo contrato
            </Button>
          </>
        }
      />
      <Container size="lg" data-testid="page-content" className="os-touch" pb="xl">
        <Stack gap="md">
          <SubscriptionBanner limits={subscription?.usageLimits} planName={subscription?.plan?.name} />
          {loading || sessionStatus === "loading" ? (
            <ListSkeleton rows={5} />
          ) : error ? (
            <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light" role="alert">
              {error}
              <Button variant="default" mt="sm" display="block" onClick={() => load()}>Reintentar</Button>
            </Alert>
          ) : contracts.length === 0 ? (
            <EmptyState
              icon={<IconFileText size={32} />}
              title="Aún no tienes contratos"
              description="Crea tu primer contrato para empezar a pedir firmas."
              action={<Button leftSection={<IconPlus size={18} />} onClick={newContract}>Crear contrato</Button>}
            />
          ) : (
            <>
              <StatTiles
                items={[
                  { label: "Total", value: stats.total, color: "blue", active: status === "todos", onClick: () => setStatus("todos") },
                  { label: "Activos", value: stats.active, color: "green", active: status === "active", onClick: () => setFilter("active") },
                  { label: "Usos", value: stats.uses, color: "gray" },
                ]}
              />
              <ContractsFilterBar query={query} onQuery={setQuery} status={status} onStatus={setStatus} counts={counts} />
              <PendingActivationSection contracts={pending} {...handlers} />
              {list.length === 0 && pending.length === 0 ? (
                <EmptyState
                  icon={<IconFileText size={32} />}
                  title="No se encontraron contratos"
                  description="Prueba con otro filtro o término de búsqueda."
                  action={<Button variant="default" onClick={() => { setQuery(""); setStatus("todos"); }}>Limpiar filtros</Button>}
                />
              ) : (
                list.length > 0 && (
                  <div className="os-crows" data-testid="contract-list">
                    {list.map((c) => (
                      <ContractRow key={c.id} contract={c} {...handlers} />
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </Stack>
      </Container>

      <ConfirmSheet
        opened={!!toArchive}
        onClose={() => !archiving && setToArchive(null)}
        title="Archivar contrato"
        message={`¿Archivar «${toArchive?.name ?? ""}»? Dejará de aparecer en tu lista; las firmas ya recibidas se conservan.`}
        confirmLabel="Archivar"
        destructive
        loading={archiving}
        onConfirm={confirmArchive}
      />
      <NewSignatureRequestWizard
        mode="sheet"
        opened={!!wizardContractId}
        onClose={() => setWizardContractId(null)}
        initialContractId={wizardContractId ?? undefined}
        onCompleted={() => load(true)}
      />
    </>
  );
}
