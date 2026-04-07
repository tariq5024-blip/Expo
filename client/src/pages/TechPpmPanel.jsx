import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Pencil, Wrench } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const EQUIPMENT_OPTIONS = ['Ladder', 'Scaffold', 'Manlift', 'Rope', 'Safety Harness'];

/** Must match server `PPM_CYCLE_MS` (180-day PPM cycle). */
const PPM_CYCLE_MS = 180 * 24 * 60 * 60 * 1000;

const ppmDownloadFallbackFilename = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `PPM_Report_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.xlsx`;
};

/** GET /api/assets returns `{ items, total, page, pages }` (not `assets`). */
const assetListFromResponse = (data) => {
  if (!data) return [];
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.assets)) return data.assets;
  if (Array.isArray(data)) return data;
  return [];
};

const formatCreateAssetLabel = (a) => {
  if (!a) return '';
  const title = a.product_name || a.name || a.model_number || 'Asset';
  return `${title} | UID:${a.uniqueId || '—'} | ABS:${a.abs_code || '—'} | SN:${a.serial_number || '—'} | IP:${a.ip_address || '—'} | MAC:${a.mac_address || '—'}`;
};

const formatCreateAssetShortLabel = (a) => {
  if (!a) return '';
  const title = a.product_name || a.name || a.model_number || 'Asset';
  const uid = a.uniqueId || '—';
  return `${title} · ${uid}`;
};

const nextServiceMeta = (openTask, lastCompletedAt) => {
  if (openTask?.due_at) {
    const d = new Date(openTask.due_at);
    if (!Number.isNaN(d.getTime())) {
      const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
      if (days < 0) return { label: 'Overdue', tone: 'rose' };
      return { label: `${days} Days`, tone: 'amber' };
    }
  }
  if (lastCompletedAt) {
    const next = new Date(new Date(lastCompletedAt).getTime() + PPM_CYCLE_MS);
    if (!Number.isNaN(next.getTime())) {
      const days = Math.ceil((next.getTime() - Date.now()) / 86400000);
      if (days < 0) return { label: 'Overdue', tone: 'rose' };
      return { label: `${days} Days`, tone: 'amber' };
    }
  }
  return { label: '—', tone: 'slate' };
};

const vmsBadgeClass = (label) => {
  if (label === 'Online') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (label === 'Offline') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const nextBadgeClass = (tone) => {
  if (tone === 'rose') return 'bg-rose-100 text-rose-900 border-rose-200';
  if (tone === 'amber') return 'bg-amber-100 text-amber-900 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const UNHEALTHY_CONDITIONS = new Set(['faulty', 'workshop', 'under repair/workshop']);

const isAssetUnhealthy = (condition) => UNHEALTHY_CONDITIONS.has(String(condition || '').trim().toLowerCase());

const isRowUnhealthyForSystemHealth = (r) => {
  if (isAssetUnhealthy(r?.asset?.condition)) return true;
  return String(r?.vms_label || '').trim() === 'Offline';
};

/** Must match server `VMS_CHECKLIST_KEY` */
const VMS_CHECKLIST_KEY = 'vms_online';
const WORKORDER_PAGE_SIZE = 50;

const PPM_BULK_NOTIFY_SESSION_PREFIX = 'ppm_pending_bulk_notify_';
const PPM_CREATE_DRAFT_SESSION_PREFIX = 'ppm_create_draft_';
const PPM_REMOVE_UNDO_MS = 6000;

const TechPpmPanel = () => {
  const { user, activeStore } = useAuth();
  const [searchParams] = useSearchParams();
  const canOpenAssetHistory = user?.role === 'Admin' || user?.role === 'Super Admin' || user?.role === 'Viewer';
  const canManagePpmInclusion = user?.role === 'Admin' || user?.role === 'Super Admin';

  const [rows, setRows] = useState([]);
  const [overview, setOverview] = useState({
    total: 0,
    overdue: 0,
    completed: 0,
    notCompleted: 0,
    open: 0,
    health: 100
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [assetPage, setAssetPage] = useState(1);
  const [assetMeta, setAssetMeta] = useState({ total: 0, pages: 1, limit: WORKORDER_PAGE_SIZE });
  const [density, setDensity] = useState('comfortable');
  const [columnPreset, setColumnPreset] = useState('full');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [task, setTask] = useState(null);
  const [spareForm, setSpareForm] = useState({ item_name: '', quantity: 1, description: '' });
  const [spareSubmitting, setSpareSubmitting] = useState(false);
  const [showIncompleteList, setShowIncompleteList] = useState(false);
  const [incompleteTasks, setIncompleteTasks] = useState([]);
  const [incompleteLoading, setIncompleteLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [ppmSavingId, setPpmSavingId] = useState(null);
  const [techs, setTechs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    asset_id: '',
    assigned_to: '',
    scheduled_for: '',
    due_at: '',
    work_order_ticket: ''
  });
  const [createAssetSearch, setCreateAssetSearch] = useState('');
  const [createAssetResults, setCreateAssetResults] = useState([]);
  const [createAssetPickLoading, setCreateAssetPickLoading] = useState(false);
  const [ppmTicketAutofillHint, setPpmTicketAutofillHint] = useState('');
  const [createAssetMenuOpen, setCreateAssetMenuOpen] = useState(false);
  const [ppmPickHint, setPpmPickHint] = useState(null);
  const createPickerRef = useRef(null);
  const [resetProgramOpen, setResetProgramOpen] = useState(false);
  const [resetProgramPassword, setResetProgramPassword] = useState('');
  const [resetProgramBusy, setResetProgramBusy] = useState(false);
  const [pendingBulkPpmNotify, setPendingBulkPpmNotify] = useState(false);
  const [bulkNotifyBusy, setBulkNotifyBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [pendingDrawerCancel, setPendingDrawerCancel] = useState(null);
  const [pendingResetProgram, setPendingResetProgram] = useState(null);
  const ticketLookupGen = useRef(0);
  const pendingRemoveTimerRef = useRef(null);
  const pendingDrawerCancelTimerRef = useRef(null);
  const pendingResetTimerRef = useRef(null);
  const assetsLoadGen = useRef(0);
  const incompleteLoadGen = useRef(0);
  const workOrderColSpan = canManagePpmInclusion ? 15 : 14;

  const bulkNotifySessionKey = useMemo(() => {
    const id = activeStore?._id != null ? String(activeStore._id) : '';
    return `${PPM_BULK_NOTIFY_SESSION_PREFIX}${id || 'default'}`;
  }, [activeStore]);
  const createDraftSessionKey = useMemo(() => {
    const id = activeStore?._id != null ? String(activeStore._id) : '';
    return `${PPM_CREATE_DRAFT_SESSION_PREFIX}${id || 'default'}`;
  }, [activeStore]);

  const updatePendingBulkNotify = useCallback(
    (next) => {
      setPendingBulkPpmNotify(next);
      if (!bulkNotifySessionKey || !canManagePpmInclusion) return;
      if (next) sessionStorage.setItem(bulkNotifySessionKey, '1');
      else sessionStorage.removeItem(bulkNotifySessionKey);
    },
    [bulkNotifySessionKey, canManagePpmInclusion]
  );

  useEffect(() => {
    if (!canManagePpmInclusion || !bulkNotifySessionKey) {
      setPendingBulkPpmNotify(false);
      return;
    }
    setPendingBulkPpmNotify(sessionStorage.getItem(bulkNotifySessionKey) === '1');
  }, [canManagePpmInclusion, bulkNotifySessionKey]);

  useEffect(() => {
    if (!canManagePpmInclusion || !pendingBulkPpmNotify) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [canManagePpmInclusion, pendingBulkPpmNotify]);

  useEffect(() => {
    if (!canManagePpmInclusion || !createDraftSessionKey) return;
    try {
      const raw = sessionStorage.getItem(createDraftSessionKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      setCreateForm((f) => ({
        ...f,
        assigned_to: String(draft?.assigned_to || ''),
        scheduled_for: String(draft?.scheduled_for || ''),
        due_at: String(draft?.due_at || ''),
        work_order_ticket: String(draft?.work_order_ticket || '')
      }));
    } catch {
      // Ignore malformed draft payload.
    }
  }, [canManagePpmInclusion, createDraftSessionKey]);

  useEffect(() => {
    if (!canManagePpmInclusion || !createDraftSessionKey) return;
    const draft = {
      assigned_to: String(createForm.assigned_to || ''),
      scheduled_for: String(createForm.scheduled_for || ''),
      due_at: String(createForm.due_at || ''),
      work_order_ticket: String(createForm.work_order_ticket || '')
    };
    sessionStorage.setItem(createDraftSessionKey, JSON.stringify(draft));
  }, [
    createForm.assigned_to,
    createForm.scheduled_for,
    createForm.due_at,
    createForm.work_order_ticket,
    canManagePpmInclusion,
    createDraftSessionKey
  ]);

  const resetCreateAssetPickerUi = () => {
    setCreateAssetSearch('');
    setCreateAssetResults([]);
    setCreateAssetMenuOpen(false);
    setPpmPickHint(null);
    setPpmTicketAutofillHint('');
  };

  const clearCreateAssetSelection = () => {
    setCreateForm((f) => ({ ...f, asset_id: '', work_order_ticket: '' }));
    resetCreateAssetPickerUi();
  };

  const prefillCreateFromAsset = (a) => {
    if (!a?._id || !canManagePpmInclusion) return;
    setPpmPickHint(a);
    const suggestedTicket = String(a?.open_task?.work_order_ticket || '').trim();
    setCreateForm((f) => ({ ...f, asset_id: String(a._id), work_order_ticket: suggestedTicket }));
    setCreateAssetSearch(formatCreateAssetLabel(a));
    setCreateAssetMenuOpen(false);
    setPpmTicketAutofillHint('Loading previous PPM ticket...');
  };

  const createSelectedPreview = useMemo(() => {
    if (!createForm.asset_id) return null;
    const id = String(createForm.asset_id);
    if (ppmPickHint && String(ppmPickHint._id) === id) return ppmPickHint;
    return createAssetResults.find((x) => String(x._id) === id) || null;
  }, [createForm.asset_id, ppmPickHint, createAssetResults]);

  const load = useCallback(async () => {
    const gen = ++assetsLoadGen.current;
    try {
      setLoading(true);
      const q = query.trim();
      const params = { page: assetPage, limit: WORKORDER_PAGE_SIZE };
      if (q) {
        params.q = q;
      } else if (canManagePpmInclusion) {
        params.program_only = true;
      }
      const [assetsRes, ovRes] = await Promise.all([
        api.get('/ppm/self-service-assets', { params }),
        api.get('/ppm/overview')
      ]);
      if (gen !== assetsLoadGen.current) return;
      if (canManagePpmInclusion) {
        try {
          const u = await api.get('/users');
          if (gen !== assetsLoadGen.current) return;
          const techRows = (Array.isArray(u?.data) ? u.data : []).filter((x) => x.role === 'Technician');
          setTechs(techRows);
        } catch {
          if (gen !== assetsLoadGen.current) return;
          setTechs([]);
        }
      } else {
        setTechs([]);
      }
      const payload = assetsRes?.data;
      const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
      setRows(items);
      setAssetMeta({
        total: Number(payload?.total ?? items.length),
        pages: Math.max(1, Number(payload?.pages ?? 1)),
        limit: Number(payload?.limit ?? WORKORDER_PAGE_SIZE)
      });
      if (payload?.page != null) {
        setAssetPage(Math.max(1, Number(payload.page) || 1));
      }
      setOverview(
        ovRes.data || { total: 0, overdue: 0, completed: 0, notCompleted: 0, open: 0, health: 100 }
      );
    } catch (error) {
      if (gen !== assetsLoadGen.current) return;
      alert(error.response?.data?.message || 'Failed to load PPM data');
    } finally {
      if (gen === assetsLoadGen.current) setLoading(false);
    }
  }, [query, canManagePpmInclusion, assetPage]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setAssetPage(1);
  }, [query, canManagePpmInclusion]);

  useEffect(() => {
    const q0 = searchParams.get('q');
    if (q0 != null && String(q0).trim() !== '') setQuery(String(q0).trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time ?q= from URL (e.g. old /ppm/panel?q=… bookmarks)
  }, []);

  useEffect(() => {
    let cancelled = false;
    const qt = createAssetSearch.trim();
    if (!qt) {
      setCreateAssetResults([]);
      setCreateAssetPickLoading(false);
      return undefined;
    }
    setCreateAssetPickLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/assets', { params: { q: qt, limit: 75, page: 1 } });
        if (cancelled) return;
        setCreateAssetResults(assetListFromResponse(res.data));
      } catch {
        if (!cancelled) setCreateAssetResults([]);
      } finally {
        if (!cancelled) setCreateAssetPickLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [createAssetSearch]);

  useEffect(() => {
    const onDown = (e) => {
      if (!createPickerRef.current?.contains(e.target)) setCreateAssetMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (!canManagePpmInclusion) return;
    const assetId = String(createForm.asset_id || '').trim();
    if (!assetId) {
      setPpmTicketAutofillHint('');
      return;
    }
    const gen = ++ticketLookupGen.current;
    const loadLastTicket = async () => {
      try {
        const { data } = await api.get(`/ppm/assets/${assetId}/last-ticket`);
        if (gen !== ticketLookupGen.current) return;
        const ticket = String(data?.work_order_ticket || '').trim();
        const lastTicketAt = data?.last_ticket_at ? new Date(data.last_ticket_at) : null;
        const lastTicketLabel =
          lastTicketAt && !Number.isNaN(lastTicketAt.getTime())
            ? lastTicketAt.toLocaleDateString()
            : '';
        setCreateForm((f) => {
          if (String(f.asset_id || '') !== assetId) return f;
          return { ...f, work_order_ticket: ticket };
        });
        setPpmTicketAutofillHint(
          ticket
            ? `Using last PPM ticket${lastTicketLabel ? ` (${lastTicketLabel})` : ''}. You can edit it before creating.`
            : 'First PPM for this asset: enter a work order ticket. Next times it will auto-fill.'
        );
      } catch {
        if (gen !== ticketLookupGen.current) return;
        setPpmTicketAutofillHint('Could not fetch previous PPM ticket. Enter the work order ticket manually.');
      }
    };
    void loadLastTicket();
  }, [createForm.asset_id, canManagePpmInclusion]);

  const loadIncomplete = useCallback(async () => {
    const gen = ++incompleteLoadGen.current;
    try {
      setIncompleteLoading(true);
      const res = await api.get('/ppm', { params: { status: 'Not Completed', limit: 500 } });
      if (gen !== incompleteLoadGen.current) return;
      setIncompleteTasks(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      if (gen !== incompleteLoadGen.current) return;
      alert(error.response?.data?.message || 'Failed to load not-completed PPMs');
    } finally {
      if (gen === incompleteLoadGen.current) setIncompleteLoading(false);
    }
  }, []);

  const downloadPpmExcel = async () => {
    try {
      setExportBusy(true);
      const res = await api.get('/ppm/export', { responseType: 'blob' });
      const blob = res.data;
      if (blob?.type?.includes('application/json')) {
        const text = await blob.text();
        const j = JSON.parse(text);
        alert(j.message || 'Export failed');
        return;
      }
      const dispo = res.headers['content-disposition'];
      const match = dispo && /filename="([^"]+)"|filename=([^;\s]+)/i.exec(dispo);
      const name = (match && (match[1] || match[2])?.trim()) || ppmDownloadFallbackFilename();
      const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.response?.data?.message || 'Could not download PPM report');
    } finally {
      setExportBusy(false);
    }
  };

  useEffect(() => {
    if (showIncompleteList) loadIncomplete();
  }, [showIncompleteList, loadIncomplete]);

  const pieData = useMemo(() => {
    const programTotal = overview.total || 0;
    if (programTotal === 0) {
      return [{ name: 'No data', value: 1, empty: true }];
    }
    const completed = overview.completed || 0;
    const notCompleted = overview.notCompleted || 0;
    const open =
      overview.open != null
        ? overview.open
        : Math.max(0, programTotal - completed - notCompleted);
    if (completed === 0 && notCompleted === 0 && open === 0) {
      return [{ name: 'No data', value: 1, empty: true }];
    }
    return [
      { name: 'Completed', value: completed, empty: false },
      { name: 'Not completed', value: notCompleted, empty: false },
      { name: 'Open', value: open, empty: false }
    ];
  }, [overview]);

  const taskTotal = overview.total || 0;
  const completedCount = overview.completed || 0;
  const notCompletedCount = overview.notCompleted || 0;
  const openCount =
    overview.open != null
      ? overview.open
      : Math.max(0, taskTotal - completedCount - notCompletedCount);
  const completedPct = taskTotal > 0 ? Math.round((completedCount / taskTotal) * 100) : 0;
  const overduePct = taskTotal > 0 ? Math.round(((overview.overdue || 0) / taskTotal) * 100) : 0;
  const notCompletedPct = taskTotal > 0 ? Math.round((notCompletedCount / taskTotal) * 100) : 0;

  /** Drop invalid / duplicate assets so the table and KPIs stay aligned (duplicate React keys caused blank rows). */
  const displayRows = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const id = r?.asset?._id;
      if (id == null || id === '') continue;
      const k = String(id);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    return out;
  }, [rows]);

  const systemHealthPct = useMemo(() => {
    if (!displayRows.length) return overview.health ?? 100;
    const unhealthy = displayRows.filter((r) => isRowUnhealthyForSystemHealth(r)).length;
    return Math.round(((displayRows.length - unhealthy) / displayRows.length) * 100);
  }, [displayRows, overview.health]);
  const unhealthyCount = Math.max(0, displayRows.length - Math.round((systemHealthPct / 100) * displayRows.length));

  const overduePie = useMemo(() => ([
    { name: 'Overdue', value: overview.overdue || 0 },
    { name: 'Other', value: Math.max(0, taskTotal - (overview.overdue || 0)) }
  ]), [overview.overdue, taskTotal]);

  const notCompletedPie = useMemo(() => ([
    { name: 'Not completed', value: notCompletedCount || 0 },
    { name: 'Other', value: Math.max(0, taskTotal - notCompletedCount) }
  ]), [notCompletedCount, taskTotal]);

  const healthPie = useMemo(() => ([
    { name: 'Healthy', value: Math.max(0, displayRows.length - unhealthyCount) },
    { name: 'Unhealthy', value: unhealthyCount }
  ]), [displayRows.length, unhealthyCount]);

  const createDateMeta = useMemo(() => {
    const scheduledRaw = String(createForm.scheduled_for || '').trim();
    const dueRaw = String(createForm.due_at || '').trim();
    if (!scheduledRaw && !dueRaw) return '';
    const scheduledAt = scheduledRaw ? new Date(`${scheduledRaw}T00:00:00`) : null;
    const dueAt = dueRaw ? new Date(`${dueRaw}T00:00:00`) : null;
    const validScheduled = scheduledAt && !Number.isNaN(scheduledAt.getTime());
    const validDue = dueAt && !Number.isNaN(dueAt.getTime());
    if (validScheduled && validDue) {
      const days = Math.round((dueAt.getTime() - scheduledAt.getTime()) / 86400000);
      return `${days} day${Math.abs(days) === 1 ? '' : 's'} between dates`;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (validDue) {
      const days = Math.round((dueAt.getTime() - today.getTime()) / 86400000);
      return `${days} day${Math.abs(days) === 1 ? '' : 's'} from today to due`;
    }
    return '';
  }, [createForm.scheduled_for, createForm.due_at]);

  const openChecklist = async (assetId) => {
    try {
      setBusy(true);
      const res = await api.post(`/ppm/assets/${assetId}/session`);
      setTask(res.data);
      setDrawerOpen(true);
    } catch (error) {
      alert(error.response?.data?.message || 'Could not open PPM checklist');
    } finally {
      setBusy(false);
    }
  };

  const togglePpmEnabled = async (assetId, enabled) => {
    if (!assetId) return;
    try {
      setPpmSavingId(String(assetId));
      await api.patch(`/ppm/assets/${assetId}/ppm-enabled`, { enabled });
      if (enabled && canManagePpmInclusion) updatePendingBulkNotify(true);
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not update PPM marking');
    } finally {
      setPpmSavingId(null);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTask(null);
    setSpareForm({ item_name: '', quantity: 1, description: '' });
  };

  const updateItem = (idx, value) => {
    if (!task) return;
    const checklist = [...(task.checklist || [])];
    checklist[idx] = { ...checklist[idx], value };
    setTask({ ...task, checklist });
  };

  const save = async () => {
    if (!task?._id) return;
    try {
      setBusy(true);
      if (task.status === 'Scheduled') {
        await api.patch(`/ppm/${task._id}/start`);
      }
      const res = await api.patch(`/ppm/${task._id}/submit`, {
        checklist: task.checklist || [],
        technician_notes: task.technician_notes || '',
        equipment_used: task.equipment_used || []
      });
      if (res?.data) setTask(res.data);
      void load();
      if (showIncompleteList) void loadIncomplete();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save checklist');
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!task?._id) return;
    try {
      setBusy(true);
      await api.patch(`/ppm/${task._id}/complete`, {
        checklist: task.checklist || [],
        equipment_used: task.equipment_used || [],
        technician_notes: task.technician_notes || ''
      });
      closeDrawer();
      void load();
      if (showIncompleteList) void loadIncomplete();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to complete PPM');
    } finally {
      setBusy(false);
    }
  };

  const reopenForEditDrawer = async () => {
    if (!task?._id) return;
    if (
      !window.confirm(
        'Reopen this PPM for editing? It will return to In Progress so you can update the checklist and save or complete again.'
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const res = await api.patch(`/ppm/${task._id}/reopen-for-edit`);
      setTask(res.data);
      void load();
      if (showIncompleteList) void loadIncomplete();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not reopen PPM for editing');
    } finally {
      setBusy(false);
    }
  };

  const markNotCompleted = async () => {
    if (!task?._id) return;
    const reason = String(task.technician_notes || '').trim();
    if (reason.length < 8) {
      alert('Write at least 8 characters in the comment box explaining why this PPM could not be completed, then tap “Not completed”.');
      return;
    }
    try {
      setBusy(true);
      await api.patch(`/ppm/${task._id}/mark-not-completed`, {
        technician_notes: reason,
        checklist: task.checklist || [],
        equipment_used: task.equipment_used || []
      });
      closeDrawer();
      void load();
      if (showIncompleteList) void loadIncomplete();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to mark PPM as not completed');
    } finally {
      setBusy(false);
    }
  };

  const toggleEquipment = (eq) => {
    if (!task) return;
    const current = new Set(task.equipment_used || []);
    if (current.has(eq)) current.delete(eq);
    else current.add(eq);
    setTask({ ...task, equipment_used: Array.from(current) });
  };

  const assetName = (a) => String(a?.model_number || a?.name || a?.product_name || '—');

  const openPpmTaskCanCancel = (t) =>
    Boolean(t?._id && t.status !== 'Completed' && t.status !== 'Cancelled');

  const performRemoveFromPpmList = useCallback(async (taskId, assetId) => {
    if (!taskId) return;
    try {
      setBusy(true);
      await api.patch(`/ppm/${taskId}/cancel`, { reason: 'Cancelled from PPM work orders' });
      if (assetId) {
        await api.patch(`/ppm/assets/${assetId}/ppm-enabled`, { enabled: false });
      }
      void load();
    } catch (error) {
      alert(error.response?.data?.message || 'Could not remove this asset from the PPM list');
    } finally {
      setBusy(false);
    }
  }, [load]);

  const cancelOpenPpmTask = (taskId, assetId) => {
    if (!taskId) return;
    if (
      !window.confirm(
        'Do you want to delete this PPM from the list? This will cancel the open task and remove the asset from the PPM program.'
      )
    ) {
      return;
    }
    if (pendingRemoveTimerRef.current) {
      window.clearTimeout(pendingRemoveTimerRef.current);
      pendingRemoveTimerRef.current = null;
    }
    setPendingRemove({ taskId, assetId });
    pendingRemoveTimerRef.current = window.setTimeout(() => {
      pendingRemoveTimerRef.current = null;
      setPendingRemove((current) => {
        if (!current) return null;
        void performRemoveFromPpmList(current.taskId, current.assetId);
        return null;
      });
    }, PPM_REMOVE_UNDO_MS);
  };

  const undoPendingRemove = () => {
    if (pendingRemoveTimerRef.current) {
      window.clearTimeout(pendingRemoveTimerRef.current);
      pendingRemoveTimerRef.current = null;
    }
    setPendingRemove(null);
  };

  useEffect(() => () => {
    if (pendingRemoveTimerRef.current) {
      window.clearTimeout(pendingRemoveTimerRef.current);
      pendingRemoveTimerRef.current = null;
    }
    if (pendingDrawerCancelTimerRef.current) {
      window.clearTimeout(pendingDrawerCancelTimerRef.current);
      pendingDrawerCancelTimerRef.current = null;
    }
    if (pendingResetTimerRef.current) {
      window.clearTimeout(pendingResetTimerRef.current);
      pendingResetTimerRef.current = null;
    }
  }, []);

  const submitSpareRequest = async () => {
    if (!task?._id || !task?.asset?._id) return;
    const itemName = String(spareForm.item_name || '').trim();
    const qty = Math.max(1, Number(spareForm.quantity) || 1);
    const description = String(spareForm.description || '').trim();
    if (!itemName) {
      alert('Enter required spare part name.');
      return;
    }
    try {
      setSpareSubmitting(true);
      await api.post('/requests', {
        item_name: itemName,
        quantity: qty,
        description: `PPM spare request\nTask: ${task._id}\nAsset UID: ${task.asset?.uniqueId || 'N/A'}\nAsset ABS: ${task.asset?.abs_code || 'N/A'}\n${description}`.trim(),
        request_type: 'PPM Spare Parts',
        ppm_task: task._id,
        asset: task.asset._id
      });
      setSpareForm({ item_name: '', quantity: 1, description: '' });
      alert('Spare parts request sent to admin for approve/reject/modify.');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to send spare parts request');
    } finally {
      setSpareSubmitting(false);
    }
  };

  const createTask = async () => {
    if (!createForm.asset_id) {
      alert('Please select an asset.');
      return;
    }
    if (!String(createForm.work_order_ticket || '').trim()) {
      alert('PPM work order ticket is required for this asset.');
      return;
    }
    try {
      setCreating(true);
      await api.post('/ppm', {
        ...createForm,
        scheduled_for: createForm.scheduled_for || new Date().toISOString()
      });
      setCreateForm((f) => ({ ...f, asset_id: '' }));
      resetCreateAssetPickerUi();
      if (canManagePpmInclusion) updatePendingBulkNotify(true);
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to create PPM task');
    } finally {
      setCreating(false);
    }
  };

  const confirmResetPpmProgram = async () => {
    const password = resetProgramPassword.trim();
    if (!password) {
      alert('Enter your account password to confirm.');
      return;
    }
    if (pendingResetTimerRef.current) {
      window.clearTimeout(pendingResetTimerRef.current);
      pendingResetTimerRef.current = null;
    }
    setResetProgramOpen(false);
    setResetProgramPassword('');
    setPendingResetProgram({ password });
    pendingResetTimerRef.current = window.setTimeout(() => {
      pendingResetTimerRef.current = null;
      setPendingResetProgram((current) => {
        if (!current?.password) return null;
        void (async () => {
          try {
            setResetProgramBusy(true);
            const { data } = await api.post('/ppm/reset-program', { password: current.password });
            closeDrawer();
            clearCreateAssetSelection();
            await load();
            const n = data?.deletedTasks ?? 0;
            const a = data?.assetsPpmCleared ?? 0;
            alert(`PPM program reset for this store. Removed ${n} task(s) and cleared PPM flags on ${a} asset(s).`);
          } catch (error) {
            alert(error.response?.data?.message || 'Could not reset PPM program');
          } finally {
            setResetProgramBusy(false);
          }
        })();
        return null;
      });
    }, PPM_REMOVE_UNDO_MS);
  };

  const cancelTaskDrawer = async () => {
    if (!task?._id) return;
    if (!window.confirm('Cancel this PPM task? It will be marked cancelled.')) return;
    if (pendingDrawerCancelTimerRef.current) {
      window.clearTimeout(pendingDrawerCancelTimerRef.current);
      pendingDrawerCancelTimerRef.current = null;
    }
    setPendingDrawerCancel({ taskId: task._id });
    pendingDrawerCancelTimerRef.current = window.setTimeout(() => {
      pendingDrawerCancelTimerRef.current = null;
      setPendingDrawerCancel((current) => {
        if (!current?.taskId) return null;
        void (async () => {
          try {
            setBusy(true);
            await api.patch(`/ppm/${current.taskId}/cancel`, { reason: 'Cancelled from PPM work orders' });
            closeDrawer();
            void load();
            if (showIncompleteList) void loadIncomplete();
          } catch (error) {
            alert(error.response?.data?.message || 'Failed to cancel task');
          } finally {
            setBusy(false);
          }
        })();
        return null;
      });
    }, PPM_REMOVE_UNDO_MS);
  };

  const undoPendingDrawerCancel = () => {
    if (pendingDrawerCancelTimerRef.current) {
      window.clearTimeout(pendingDrawerCancelTimerRef.current);
      pendingDrawerCancelTimerRef.current = null;
    }
    setPendingDrawerCancel(null);
  };

  const undoPendingResetProgram = () => {
    if (pendingResetTimerRef.current) {
      window.clearTimeout(pendingResetTimerRef.current);
      pendingResetTimerRef.current = null;
    }
    setPendingResetProgram(null);
  };

  const sendBulkPpmNotification = async () => {
    try {
      setBulkNotifyBusy(true);
      const { data } = await api.post('/ppm/notify-bulk-program');
      const n = Number(data?.recipientCount);
      alert(Number.isFinite(n) && n > 0 ? `Bulk notification sent to ${n} recipient(s).` : 'Bulk notification sent.');
      updatePendingBulkNotify(false);
    } catch (error) {
      alert(error.response?.data?.message || 'Could not send bulk notification');
    } finally {
      setBulkNotifyBusy(false);
    }
  };

  const dismissBulkPpmNotifyReminder = () => {
    if (
      !window.confirm(
        'Dismiss this reminder without sending? It will stay cleared until you change the PPM program again (turn PPM on for an asset or create a PPM task).'
      )
    ) {
      return;
    }
    updatePendingBulkNotify(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">PPM — 180-day overview</h1>
        <p className="text-sm text-slate-600 mt-1">
          {canManagePpmInclusion ? (
            <>
              <span className="font-semibold">Type in the search box</span> to find assets in the store; use the{' '}
              <span className="font-semibold">PPM</span> column to include or remove assets from the program. With an empty search, this table lists the same{' '}
              <span className="font-semibold">PPM scope as the overview</span> (flagged for PPM or with a non-cancelled PPM task). Open the wrench to run the checklist.
            </>
          ) : (
            <>Search by Unique ID, ABS code, or IP. Open the wrench on a listed asset to run the checklist.</>
          )}
        </p>
      </div>

      {canManagePpmInclusion && pendingBulkPpmNotify ? (
        <div
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm"
        >
          <p className="text-sm text-amber-950">
            You changed the PPM program for this store. Send a bulk notification to technicians and all store email recipients so everyone is aligned.
          </p>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              disabled={bulkNotifyBusy}
              onClick={sendBulkPpmNotification}
              className="inline-flex items-center justify-center rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {bulkNotifyBusy ? 'Sending…' : 'Send bulk notification'}
            </button>
            <button
              type="button"
              disabled={bulkNotifyBusy}
              onClick={dismissBulkPpmNotifyReminder}
              className="inline-flex items-center justify-center rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {canManagePpmInclusion && pendingRemove ? (
        <div
          role="status"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm"
        >
          <p className="text-sm text-rose-950">
            Removing from PPM list in a few seconds.
          </p>
          <button
            type="button"
            onClick={undoPendingRemove}
            className="inline-flex items-center justify-center rounded-lg border border-rose-400 bg-white px-3 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
          >
            Undo
          </button>
        </div>
      ) : null}

      {canManagePpmInclusion && pendingDrawerCancel ? (
        <div
          role="status"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm"
        >
          <p className="text-sm text-rose-950">
            Cancelling this drawer task in a few seconds.
          </p>
          <button
            type="button"
            onClick={undoPendingDrawerCancel}
            className="inline-flex items-center justify-center rounded-lg border border-rose-400 bg-white px-3 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
          >
            Undo
          </button>
        </div>
      ) : null}

      {canManagePpmInclusion && pendingResetProgram ? (
        <div
          role="status"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm"
        >
          <p className="text-sm text-rose-950">
            Reset PPM program queued. It will run in a few seconds.
          </p>
          <button
            type="button"
            onClick={undoPendingResetProgram}
            className="inline-flex items-center justify-center rounded-lg border border-rose-400 bg-white px-3 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
          >
            Undo
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col min-h-[220px]">
          <div className="text-xs font-semibold uppercase text-slate-500">PPM coverage</div>
          <div className="relative flex-1 min-h-[180px] mt-2">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={2}>
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={
                        entry.empty
                          ? '#cbd5e1'
                          : entry.name === 'Completed'
                            ? '#10b981'
                            : entry.name === 'Not completed'
                              ? '#f97316'
                              : '#fbbf24'
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              style={{ paddingBottom: 8 }}
            >
              {!pieData[0]?.empty ? (
                <>
                  <div className="text-4xl font-bold text-emerald-700 leading-none">{completedPct}%</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-1">Completed</div>
                </>
              ) : (
                <div className="text-sm text-slate-400">No assets in PPM</div>
              )}
            </div>
          </div>
          <div className="text-center text-sm text-slate-600">
            {!pieData[0]?.empty ? (
              <span>
                <span className="font-semibold text-orange-700">{notCompletedCount}</span> not completed
                <span className="mx-2 text-slate-300">·</span>
                <span className="font-semibold text-amber-600">{openCount}</span> open
              </span>
            ) : null}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-h-[220px]">
          <div className="text-xs font-semibold uppercase text-slate-500">Overdue PPMs</div>
          <div className="relative min-h-[170px] mt-2">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={overduePie} dataKey="value" innerRadius={42} outerRadius={64} strokeWidth={0}>
                  <Cell fill="#f43f5e" />
                  <Cell fill="#e2e8f0" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-center">
              <div>
                <div className="text-3xl font-bold text-rose-600 leading-none">{overduePct}%</div>
                <div className="text-[11px] uppercase text-slate-500 mt-1">{overview.overdue ?? 0} tasks</div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-h-[220px]">
          <div className="text-xs font-semibold uppercase text-slate-500">Not completed</div>
          <div className="relative min-h-[170px] mt-2">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={notCompletedPie} dataKey="value" innerRadius={42} outerRadius={64} strokeWidth={0}>
                  <Cell fill="#f97316" />
                  <Cell fill="#e2e8f0" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-center">
              <div>
                <div className="text-3xl font-bold text-orange-600 leading-none">{notCompletedPct}%</div>
                <div className="text-[11px] uppercase text-slate-500 mt-1">{notCompletedCount} tasks</div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-h-[220px]">
          <div className="text-xs font-semibold uppercase text-slate-500">System health</div>
          <div className="relative min-h-[170px] mt-2">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={healthPie} dataKey="value" innerRadius={42} outerRadius={64} strokeWidth={0}>
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-center">
              <div>
                <div className="text-3xl font-bold text-emerald-700 leading-none">{systemHealthPct}%</div>
                <div className="text-[11px] uppercase text-slate-500 mt-1">{unhealthyCount} unhealthy</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {canManagePpmInclusion && ppmPickHint && createForm.asset_id ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-semibold">Asset pre-selected for new PPM task</div>
            <div className="text-xs mt-1 font-mono">
              UID {ppmPickHint.uniqueId || '—'} · ABS {ppmPickHint.abs_code || '—'} · IP {ppmPickHint.ip_address || '—'}
            </div>
            <p className="text-xs mt-1 text-indigo-900/90">
              PPM work order ticket is separate from asset ticket. It auto-fills from the last PPM ticket for this asset and remains editable.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs rounded-md border border-indigo-300 px-2 py-1 text-indigo-900 hover:bg-indigo-100"
            onClick={clearCreateAssetSelection}
          >
            Clear
          </button>
        </div>
      ) : null}

      {canManagePpmInclusion ? (
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div
              className="w-full sm:w-[15rem] lg:w-[17rem] min-w-[11rem] relative flex flex-col gap-0.5"
              ref={createPickerRef}
            >
              <div className="flex gap-1">
                <input
                  value={createAssetSearch}
                  onChange={(e) => {
                    setCreateAssetSearch(e.target.value);
                    setCreateForm((f) => ({ ...f, asset_id: '' }));
                    setCreateAssetMenuOpen(true);
                  }}
                  onFocus={() => setCreateAssetMenuOpen(true)}
                  className="h-8 border border-slate-300 rounded-lg px-2 text-xs w-full min-w-0 bg-slate-50/40 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                  placeholder="UID, ABS, serial, IP, MAC, model…"
                  autoComplete="off"
                  aria-label="Search asset for new PPM task"
                  title="Search assets — pick a row to assign this PPM."
                />
                {createForm.asset_id ? (
                  <button
                    type="button"
                    className="shrink-0 h-8 px-2 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                    title="Remove selected asset"
                    onClick={clearCreateAssetSelection}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {createForm.asset_id ? (
                <span className="inline-flex w-fit max-w-full items-center gap-1 rounded border border-emerald-200 bg-emerald-50/90 px-1.5 py-0.5 text-[10px] text-emerald-900">
                  <span className="truncate min-w-0">
                    {createSelectedPreview ? formatCreateAssetShortLabel(createSelectedPreview) : 'Selected'}
                  </span>
                </span>
              ) : (
                <p className="text-[10px] text-slate-500 leading-tight">
                  Or tap <span className="font-medium">Create task</span> on a row without an open PPM.
                </p>
              )}
              {createAssetMenuOpen && createAssetSearch.trim() ? (
                <div className="absolute left-0 right-0 top-full z-30 mt-0.5 rounded-lg border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
                  {createAssetPickLoading ? (
                    <div className="px-3 py-3 text-sm text-slate-500">Searching assets…</div>
                  ) : createAssetResults.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">No assets match. Try another UID, ABS, serial, IP, or MAC.</div>
                  ) : (
                    createAssetResults.map((a) => (
                      <button
                        key={a._id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs border-b border-slate-100 last:border-0 hover:bg-indigo-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCreateForm((f) => ({ ...f, asset_id: String(a._id), work_order_ticket: '' }));
                          setCreateAssetSearch(formatCreateAssetLabel(a));
                          setCreateAssetMenuOpen(false);
                          setPpmPickHint(null);
                          setPpmTicketAutofillHint('Loading previous PPM ticket...');
                        }}
                      >
                        <div className="font-medium text-slate-800 truncate">{formatCreateAssetLabel(a)}</div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end justify-end gap-x-2 gap-y-1.5">
              <select
                value={createForm.assigned_to}
                onChange={(e) => setCreateForm({ ...createForm, assigned_to: e.target.value })}
                className="h-8 w-full min-w-[9.5rem] max-w-[11rem] border border-slate-300 rounded-lg px-2 text-xs bg-slate-50/40 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                title="Assign technician (optional)"
              >
                <option value="">Technician (optional)</option>
                {techs.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={createForm.scheduled_for}
                onChange={(e) => setCreateForm({ ...createForm, scheduled_for: e.target.value })}
                className="h-8 w-[9.25rem] shrink-0 border border-blue-300 rounded-lg px-2 text-xs bg-blue-50 text-blue-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                title="Scheduled for (optional)"
              />
              <input
                type="date"
                value={createForm.due_at}
                onChange={(e) => setCreateForm({ ...createForm, due_at: e.target.value })}
                className="h-8 w-[9.25rem] shrink-0 border border-blue-300 rounded-lg px-2 text-xs bg-blue-50 text-blue-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                title="Due date (optional — defaults to ~180 days)"
              />
              {createDateMeta ? (
                <span className="text-[9px] text-slate-500 shrink-0">
                  {createDateMeta}
                </span>
              ) : null}
              <input
                value={createForm.work_order_ticket}
                onChange={(e) => setCreateForm({ ...createForm, work_order_ticket: e.target.value })}
                className="h-8 min-w-[6.5rem] w-[9.5rem] shrink-0 border border-slate-300 rounded-lg px-2 text-xs bg-slate-50/40 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                placeholder="PPM WO ticket *"
                title="PPM work order ticket (auto-filled from last ticket, editable)"
              />
              <button
                type="button"
                disabled={creating}
                onClick={createTask}
                className="h-8 shrink-0 whitespace-nowrap rounded-lg bg-indigo-600 text-white px-2.5 text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
              >
                {creating ? 'Creating…' : 'Create PPM task'}
              </button>
              {createForm.asset_id ? (
                <span className="text-[10px] text-slate-600 min-w-[16rem] text-right">
                  {ppmTicketAutofillHint || 'PPM work order ticket will auto-fill from the last PPM task for this asset.'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex flex-wrap gap-2 items-center">
          {!showIncompleteList ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                canManagePpmInclusion
                  ? 'Type to search UID, ABS, IP, or model — then tick PPM on rows to add to the program…'
                  : 'Search Unique ID, ABS code, IP, or model…'
              }
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
            />
          ) : (
            <p className="text-sm text-slate-600 flex-1 min-w-[200px]">
              PPMs marked <span className="font-semibold text-orange-800">Not completed</span> — read technician comments below. Use “Back to work orders” to return to the asset list.
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowIncompleteList((v) => !v)}
            className={`text-sm px-3 py-2 rounded-lg border ${showIncompleteList ? 'border-slate-300 bg-white hover:bg-slate-50' : 'border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100'}`}
          >
            {showIncompleteList ? 'Back to work orders' : 'Not completed PPMs'}
          </button>
          <button
            type="button"
            onClick={() => (showIncompleteList ? loadIncomplete() : load())}
            className="text-sm px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
          >
            Refresh
          </button>
          <select value={density} onChange={(e) => setDensity(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
          <select value={columnPreset} onChange={(e) => setColumnPreset(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="full">Full columns</option>
            <option value="core">Core columns</option>
          </select>
          <button
            type="button"
            disabled={exportBusy}
            onClick={downloadPpmExcel}
            className="text-sm px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            title="Each export uses a new file name (date and time) so downloads are not overwritten."
          >
            {exportBusy ? 'Preparing…' : 'Download Excel'}
          </button>
          {canManagePpmInclusion ? (
            <button
              type="button"
              onClick={() => {
                setResetProgramPassword('');
                setResetProgramOpen(true);
              }}
              className="text-sm px-3 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100 shrink-0"
              title="Deletes all PPM tasks for this store and removes all assets from the PPM program. Requires your password."
            >
              Reset PPM program
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          {!showIncompleteList ? (
            <>
              <table className={`min-w-full ${density === 'compact' ? 'text-xs [&_th]:py-1.5 [&_td]:py-1.5' : 'text-sm'}`}>
                <thead className="bg-slate-50 border-b sticky top-0 z-10">
                  <tr>
                  {canManagePpmInclusion ? (
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-500 w-[4.5rem]" title="Include asset in PPM program">
                      PPM
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-left">Unique ID</th>
                  <th className="px-3 py-2 text-left">ABS Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className={`px-3 py-2 text-left ${columnPreset === 'core' ? 'hidden' : ''}`}>Model Number</th>
                  <th className={`px-3 py-2 text-left ${columnPreset === 'core' ? 'hidden' : ''}`}>Serial Number</th>
                  <th className={`px-3 py-2 text-left ${columnPreset === 'core' ? 'hidden' : ''}`}>MAC Address</th>
                  <th className="px-3 py-2 text-left">Ticket</th>
                  <th className={`px-3 py-2 text-left ${columnPreset === 'core' ? 'hidden' : ''}`}>Manufacturer</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className={`px-3 py-2 text-left ${columnPreset === 'core' ? 'hidden' : ''}`}>Maintenance Vendor</th>
                  <th className="px-3 py-2 text-left">VMS</th>
                  <th className="px-3 py-2 text-left">Assigned To</th>
                  <th className="px-3 py-2 text-left">Next service</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={workOrderColSpan} className="px-3 py-6 text-slate-500">Loading assets…</td></tr>
                  ) : displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={workOrderColSpan} className="px-3 py-6 text-slate-500">
                        {canManagePpmInclusion && !query.trim()
                          ? 'No assets in the PPM program yet. Use the search box to find assets, then turn PPM on in the PPM column for each row you want to include.'
                          : 'No assets match your search (or this store has no assets yet).'}
                      </td>
                    </tr>
                  ) : displayRows.map((row) => {
                    const a = row.asset || {};
                    const ns = nextServiceMeta(row.open_task, row.last_completed_at);
                    const rid = String(a._id || '');
                    return (
                      <tr key={a._id} className="border-t hover:bg-slate-50/80">
                      {canManagePpmInclusion ? (
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            disabled={ppmSavingId === rid}
                            onClick={() => togglePpmEnabled(a._id, !Boolean(a.ppm_enabled))}
                            className={`min-w-[3.25rem] rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                              a.ppm_enabled
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
                            }`}
                            title={a.ppm_enabled ? 'Remove from PPM program' : 'Add to PPM program'}
                          >
                            {a.ppm_enabled ? 'On' : 'Off'}
                          </button>
                        </td>
                      ) : null}
                      <td className="px-3 py-2 font-mono text-xs">
                        {a._id ? (
                          <Link
                            to={`/asset/${a._id}`}
                            className="text-indigo-700 hover:text-indigo-900 hover:underline font-medium"
                            title="Open asset history"
                          >
                            {a.uniqueId || '—'}
                          </Link>
                        ) : (
                          a.uniqueId || '—'
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{a.abs_code || '—'}</td>
                      <td className="px-3 py-2">{a.name || a.product_name || '—'}</td>
                      <td className={`px-3 py-2 ${columnPreset === 'core' ? 'hidden' : ''}`}>{a.model_number || '—'}</td>
                      <td className={`px-3 py-2 font-mono text-xs ${columnPreset === 'core' ? 'hidden' : ''}`}>{a.serial_number || '—'}</td>
                      <td className={`px-3 py-2 font-mono text-xs ${columnPreset === 'core' ? 'hidden' : ''}`}>{a.mac_address || '—'}</td>
                      <td className="px-3 py-2">{row.open_task?.work_order_ticket || a.ticket_number || '—'}</td>
                      <td className={`px-3 py-2 ${columnPreset === 'core' ? 'hidden' : ''}`}>{a.manufacturer || '—'}</td>
                      <td className="px-3 py-2">{a.status || '—'}</td>
                      <td className={`px-3 py-2 ${columnPreset === 'core' ? 'hidden' : ''}`}>{a.maintenance_vendor || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${vmsBadgeClass(row.vms_label)}`}>
                          {row.vms_label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{row.assigned_to_name || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${nextBadgeClass(ns.tone)}`}>
                          {ns.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {canOpenAssetHistory && a._id ? (
                            <Link
                              to={`/asset/${a._id}`}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 inline-flex"
                              title="View asset"
                            >
                              <Eye size={16} />
                            </Link>
                          ) : null}
                          {canManagePpmInclusion && a._id ? (
                            <Link
                              to={`/assets?edit=${encodeURIComponent(String(a._id))}`}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 inline-flex"
                              title="Edit asset (name, model, serial, status, vendor, etc.)"
                            >
                              <Pencil size={16} />
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openChecklist(a._id)}
                            className="p-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                            title="PPM checklist"
                          >
                            <Wrench size={16} />
                          </button>
                          {canManagePpmInclusion && !row.open_task ? (
                            <button
                              type="button"
                              onClick={() => prefillCreateFromAsset(a)}
                              className="text-[11px] px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                              title="Pre-fill Create PPM task for this asset"
                            >
                              Create task
                            </button>
                          ) : null}
                          {canManagePpmInclusion && row.open_task?._id && openPpmTaskCanCancel(row.open_task) ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => cancelOpenPpmTask(row.open_task._id, a._id)}
                              className="ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                              title="Delete from PPM list"
                              aria-label="Delete from PPM list"
                            >
                              <span className="h-2.5 w-2.5 rounded-full bg-current shadow-sm ring-1 ring-rose-400/60" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600">
                <span>{(assetMeta.total || displayRows.length).toLocaleString()} total assets</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50"
                    disabled={loading || assetPage <= 1}
                    onClick={() => setAssetPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span>
                    Page {assetPage} of {Math.max(1, assetMeta.pages || 1)}
                  </span>
                  <button
                    type="button"
                    className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50"
                    disabled={loading || assetPage >= Math.max(1, assetMeta.pages || 1)}
                    onClick={() => setAssetPage((p) => Math.min(Math.max(1, assetMeta.pages || 1), p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <table className={`min-w-full ${density === 'compact' ? 'text-xs [&_th]:py-1.5 [&_td]:py-1.5' : 'text-sm'}`}>
              <thead className="bg-slate-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left">Unique ID</th>
                  <th className="px-3 py-2 text-left">ABS</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">Asset / model</th>
                  <th className="px-3 py-2 text-left min-w-[220px]">Technician comment</th>
                  <th className="px-3 py-2 text-left">Recorded by</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Open</th>
                </tr>
              </thead>
              <tbody>
                {incompleteLoading ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-slate-500">Loading…</td></tr>
                ) : incompleteTasks.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-slate-500">No not-completed PPMs in this store.</td></tr>
                ) : incompleteTasks.map((t) => {
                  const a = t.asset || {};
                  return (
                    <tr key={t._id} className="border-t hover:bg-orange-50/40">
                      <td className="px-3 py-2 font-mono text-xs">
                        {a._id ? (
                          <Link
                            to={`/asset/${a._id}`}
                            className="text-indigo-700 hover:text-indigo-900 hover:underline font-medium"
                            title="Open asset history"
                          >
                            {a.uniqueId || '—'}
                          </Link>
                        ) : (
                          a.uniqueId || '—'
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{a.abs_code || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{a.ip_address || '—'}</td>
                      <td className="px-3 py-2">{assetName(a)}</td>
                      <td className="px-3 py-2 text-xs text-slate-800 whitespace-pre-wrap align-top max-w-md">{t.technician_notes || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{t.incomplete_by?.name || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                        {t.incomplete_at ? new Date(t.incomplete_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-50"
                          onClick={() => {
                            setTask(t);
                            setDrawerOpen(true);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {drawerOpen && task && (() => {
        const ppmClosed = ['Completed', 'Not Completed', 'Cancelled'].includes(task.status);
        const canReopenDrawer =
          ['Technician', 'Admin', 'Super Admin'].includes(user?.role) &&
          (['Completed', 'Not Completed'].includes(task.status) ||
            (['Admin', 'Super Admin'].includes(user?.role) && task.status === 'Cancelled'));
        return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="w-full max-w-md bg-white h-full shadow-xl flex flex-col border-l border-slate-200">
            <div className="px-4 py-3 border-b flex justify-between items-start gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">PPM maintenance checklist</h2>
                <p className="text-xs text-slate-600 mt-0.5 font-mono">
                  [{task.asset?.abs_code || '—'}] · {assetName(task.asset)}
                </p>
              </div>
              <button type="button" onClick={closeDrawer} className="text-sm text-slate-500 hover:text-slate-800 px-2">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {task.status === 'Not Completed' ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
                  <div className="font-semibold">PPM not completed</div>
                  <p className="mt-2 whitespace-pre-wrap text-orange-900">{task.technician_notes || '—'}</p>
                  {task.incomplete_by?.name ? (
                    <p className="text-xs text-orange-800 mt-2">Recorded by {task.incomplete_by.name}</p>
                  ) : null}
                </div>
              ) : null}
              {(task.checklist || []).map((item, idx) => {
                const isVms = item.key === VMS_CHECKLIST_KEY;
                const choices = isVms ? ['Online', 'Offline'] : ['Good', 'Needs Replace', 'No'];
                return (
                  <div key={item.key || idx} className="border border-slate-200 rounded-lg p-2">
                    <div className="text-sm font-medium text-slate-800">{item.label}</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {choices.map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          disabled={busy || ppmClosed}
                          onClick={() => updateItem(idx, choice)}
                          className={`px-2 py-1 text-xs rounded border ${
                            item.value === choice ? 'bg-amber-300 border-amber-500' : 'bg-white border-slate-300'
                          } disabled:opacity-50`}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div>
                <div className="text-sm font-medium text-slate-800 mb-2">Equipment used</div>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT_OPTIONS.map((eq) => {
                    const on = (task.equipment_used || []).includes(eq);
                    return (
                      <button
                        key={eq}
                        type="button"
                        disabled={busy || ppmClosed}
                        onClick={() => toggleEquipment(eq)}
                        className={`px-2 py-1 text-xs rounded border ${
                          on ? 'bg-amber-200 border-amber-400' : 'bg-white border-slate-300'
                        } disabled:opacity-50`}
                      >
                        {eq}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                <div className="text-sm font-semibold text-slate-800">Outcome</div>
                <p className="text-xs text-slate-600">
                  <span className="font-medium text-emerald-800">Complete PPM</span> if the visit is done.
                  If you could not finish, write why below (required), then <span className="font-medium text-orange-800">Not completed</span>.
                </p>
              </div>
              <textarea
                value={task.technician_notes || ''}
                disabled={busy || ppmClosed}
                onChange={(e) => setTask({ ...task, technician_notes: e.target.value })}
                rows={4}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Comments (optional if you complete PPM). If not completed: explain why (min. 8 characters), then tap Not completed."
              />
              <div className="border rounded-lg p-3 bg-slate-50/70">
                <div className="text-sm font-semibold mb-2">Required spare parts for maintenance</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input
                    value={spareForm.item_name}
                    onChange={(e) => setSpareForm((p) => ({ ...p, item_name: e.target.value }))}
                    className="border rounded px-2 py-2 text-sm md:col-span-2"
                    placeholder="Part name"
                  />
                  <input
                    type="number"
                    min={1}
                    value={spareForm.quantity}
                    onChange={(e) => setSpareForm((p) => ({ ...p, quantity: Math.max(1, Number(e.target.value) || 1) }))}
                    className="border rounded px-2 py-2 text-sm"
                    placeholder="Qty"
                  />
                  <button
                    type="button"
                    disabled={spareSubmitting || busy}
                    onClick={submitSpareRequest}
                    className="px-3 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {spareSubmitting ? 'Sending…' : 'Send to admin'}
                  </button>
                </div>
                <textarea
                  value={spareForm.description}
                  onChange={(e) => setSpareForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full border rounded px-2 py-2 text-sm mt-2"
                  placeholder="Reason / notes (optional)"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t flex flex-wrap gap-2 bg-slate-50">
              {!ppmClosed ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={save}
                    className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={complete}
                    className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Complete PPM
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={markNotCompleted}
                    className="px-3 py-2 text-sm rounded-lg border-2 border-orange-500 text-orange-900 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
                  >
                    Not completed
                  </button>
                  {canManagePpmInclusion ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={cancelTaskDrawer}
                      className="px-3 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      Cancel task
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  {canReopenDrawer ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={reopenForEditDrawer}
                      className="px-3 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Edit checklist
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-100"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {resetProgramOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ppm-reset-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setResetProgramOpen(false);
              setResetProgramPassword('');
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl p-5 space-y-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="ppm-reset-title" className="text-lg font-semibold text-slate-900">
              Reset PPM program?
            </h2>
            <p className="text-sm text-slate-600">
              This applies only to your <strong>active store</strong>. All PPM tasks for this store will be permanently
              deleted, and every in-store asset will be removed from the PPM program (you can turn PPM back on per asset
              later). Enter your <strong>account password</strong> to confirm.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor="ppm-reset-password">
                Your password
              </label>
              <input
                id="ppm-reset-password"
                type="password"
                autoComplete="current-password"
                value={resetProgramPassword}
                onChange={(e) => setResetProgramPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !resetProgramBusy) confirmResetPpmProgram();
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Password"
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button
                type="button"
                disabled={resetProgramBusy}
                onClick={() => {
                  setResetProgramOpen(false);
                  setResetProgramPassword('');
                }}
                className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetProgramBusy}
                onClick={confirmResetPpmProgram}
                className="px-3 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {resetProgramBusy ? 'Resetting…' : 'Reset program'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TechPpmPanel;
