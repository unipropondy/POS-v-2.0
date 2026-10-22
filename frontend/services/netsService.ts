// frontend/services/netsService.ts
// NETS ECR3 LAN frontend service
// Handles communication with backend /api/nets endpoints for Ingenico DESK5000 terminal payments.

import { API_URL } from '../constants/Config';
import { useAuthStore } from '../stores/authStore';

export interface NetsSaleResult {
  success: boolean;
  code: string;
  msg?: string;
  approvalCode?: string;
  cardType?: string;
  cardLastFour?: string;
  transRef?: string;
  batchNo?: string;
  rawData?: string;
}

export interface NetsPingResult {
  success: boolean;
  msg: string;
  terminalIp?: string;
  terminalPort?: number;
}

export interface NetsSaleParams {
  amount: number;
  tableId?: string;
  orderId?: string;
  sessionId?: string;
  settlementId?: string;
}

/**
 * Check if the given payMode name represents a NETS payment method.
 */
export function isNetsPayMode(payMode: string): boolean {
  if (!payMode) return false;
  const norm = payMode.trim().toUpperCase();
  return (
    norm === 'NETS' ||
    norm === 'NETS QR' ||
    norm === 'NETS FLASH' ||
    norm === 'NETS CARD' ||
    norm.startsWith('NETS')
  );
}

/**
 * Initiate a NETS Sale transaction on the DESK5000 terminal via backend.
 */
export async function initiateNetsSale(params: NetsSaleParams): Promise<NetsSaleResult> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_URL}/api/nets/sale`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      amount: params.amount,
      tableId: params.tableId || '',
      orderId: params.orderId || '',
      sessionId: params.sessionId || '',
      settlementId: params.settlementId || '',
    }),
  });

  const result: NetsSaleResult = await response.json();
  return result;
}

/**
 * Query the terminal for the status of the last transaction (used after timeout or network blip).
 */
export async function queryNetsLastTransaction(): Promise<NetsSaleResult> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_URL}/api/nets/last-txn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const result: NetsSaleResult = await response.json();
  return result;
}

/**
 * Test connectivity to the NETS terminal.
 */
export async function pingNetsTerminal(): Promise<NetsPingResult> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_URL}/api/nets/ping`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const result: NetsPingResult = await response.json();
  return result;
}
