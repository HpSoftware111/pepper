import React from 'react';
import { BuildingIcon, FolderIcon, CogIcon, DiamondIcon } from './adminIcons';

export const metricCards = [
  { title: 'Active workspaces', value: '18', icon: React.createElement(BuildingIcon, { className: 'w-7 h-7' }), color: 'green' as const },
  { title: 'New matters (30d)', value: '312', icon: React.createElement(FolderIcon, { className: 'w-7 h-7' }), color: 'blue' as const },
  { title: 'AI automations', value: '126 hr saved', icon: React.createElement(CogIcon, { className: 'w-7 h-7' }), color: 'purple' as const },
  { title: 'MRR forecast', value: '$142K', icon: React.createElement(DiamondIcon, { className: 'w-7 h-7' }), color: 'yellow' as const },
];

export const workspaceData = [
  { org: 'Rivera Holdings', plan: 'Scale', seats: 48, usage: 0.92, status: 'Healthy', owner: 'M. Castillo' },
  { org: 'Dahlia Legal', plan: 'Scale', seats: 26, usage: 0.77, status: 'Growth plan', owner: 'C. Reyes' },
  { org: 'Equinox Trade', plan: 'Pilot', seats: 15, usage: 0.58, status: 'Expansion', owner: 'N. Patel' },
  { org: 'Astería Partners', plan: 'Pro', seats: 32, usage: 0.68, status: 'Healthy', owner: 'H. Moreno' },
];

export const userRoster = [
  { name: 'Laura Kim', org: 'Rivera Holdings', role: 'Admin', status: 'Active', lastActive: '2h ago' },
  { name: 'David Romero', org: 'Astería Partners', role: 'Staff', status: 'Invited', lastActive: '—' },
  { name: 'Sofia Saenz', org: 'Equinox Trade', role: 'Admin', status: 'Active', lastActive: '30m ago' },
  { name: 'Evan Li', org: 'Dahlia Legal', role: 'Partner', status: 'Suspended', lastActive: '3d ago' },
];

export const billingRows = [
  { org: 'Rivera Holdings', plan: 'Scale', arr: '$32K', nextInvoice: 'Apr 28', status: 'Paid', method: 'ACH' },
  { org: 'Equinox Trade', plan: 'Pilot', arr: '$12K', nextInvoice: 'Apr 12', status: 'Past due', method: 'Visa • 4431' },
  { org: 'Dahlia Legal', plan: 'Scale', arr: '$28K', nextInvoice: 'May 03', status: 'Paid', method: 'Wire' },
  { org: 'Astería Partners', plan: 'Pro', arr: '$8K', nextInvoice: 'Apr 30', status: 'Pending', method: 'AmEx • 9920' },
];

export const knowledgeQueue = [
  { title: 'Corte Constitucional – Sala Laboral', type: 'Sentencia', items: 18, owner: 'Pepper agent', eta: '3h left' },
  { title: 'Ley 2300 updates', type: 'Legislación', items: 6, owner: 'Ops team', eta: 'Queued' },
  { title: 'Client templates (Lozano)', type: 'Playbooks', items: 12, owner: 'Client', eta: 'Uploading' },
];

export const integrationCards = [
  { title: 'Google Workspace', status: 'Synced 15m ago', health: 'healthy', detail: 'Calendar + Drive connected' },
  { title: 'WhatsApp Business API', status: 'Auth expired', health: 'warning', detail: 'Reconnect required' },
  { title: 'iManage', status: 'OK', health: 'healthy', detail: '42k docs indexed' },
  { title: 'DocuSign', status: 'Degraded', health: 'alert', detail: 'API latency > 3s' },
];

export const auditEvents = [
  { time: '09:42', actor: 'System', text: 'Auto-synced 120 new filings into PepData', tag: 'Knowledge' },
  { time: '08:58', actor: 'M. Garcia', text: 'Granted temporary access to LexPredictor model', tag: 'Access' },
  { time: '07:30', actor: 'C. Reyes', text: 'Upgraded Astería Partners to Scale plan', tag: 'Billing' },
  { time: '07:05', actor: 'Pepper Bot', text: 'Flagged 4 invoices past due for Escala Legal', tag: 'Revenue' },
];

