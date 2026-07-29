import { defineStore } from "pinia";
import type {
  HostMetricsCollectorStatus,
  HostMetricsSample,
  HostMetricsSnapshot,
} from "~~/shared/types";

const MAX_SAMPLES = 300;

interface HostMetricsViewState {
  status: HostMetricsCollectorStatus;
  message: string | null;
  samples: HostMetricsSample[];
}

export const useGatewayHostMetricsDataStore = defineStore("gateway-host-metrics-data", () => {
  const hosts = ref<Record<number, HostMetricsViewState>>({});

  function applySnapshot(snapshot: HostMetricsSnapshot) {
    hosts.value = {
      ...hosts.value,
      [snapshot.hostId]: {
        status: snapshot.status,
        message: snapshot.message,
        samples: snapshot.samples.slice(-MAX_SAMPLES),
      },
    };
  }

  function appendSample(hostId: number, sample: HostMetricsSample) {
    const current = hosts.value[hostId] ?? emptyHostState();
    const samples = [...current.samples, sample].slice(-MAX_SAMPLES);
    hosts.value = {
      ...hosts.value,
      [hostId]: { status: "collecting", message: null, samples },
    };
  }

  function setStatus(hostId: number, status: HostMetricsCollectorStatus, message: string | null) {
    const current = hosts.value[hostId] ?? emptyHostState();
    hosts.value = { ...hosts.value, [hostId]: { ...current, status, message } };
  }

  function clearHost(hostId: number) {
    const next = { ...hosts.value };
    delete next[hostId];
    hosts.value = next;
  }

  function reset() {
    hosts.value = {};
  }

  return { hosts, applySnapshot, appendSample, setStatus, clearHost, reset };
});

function emptyHostState(): HostMetricsViewState {
  return { status: "waiting", message: null, samples: [] };
}
