import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type Employee,
  type IntakeSuggestion,
  type RequestStatus,
  type RequestStatusEvent,
  type Service,
  type ServiceRequest,
} from './api';
import './App.css';

const STATUS_LABEL: Record<RequestStatus, string> = {
  SUBMITTED: 'Submitted',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

type Notice = { kind: 'ok' | 'error'; text: string };

/** Small colored pill showing a request's current status. Kept as its own
 * component because it's used in two places (the list and the detail
 * modal) and the status -> label/color mapping only needs to live once. */
function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function apiErrorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * A banner that drops down from the top of the screen, sits for a few
 * seconds, then slides back up on its own — the same shape as an iOS/macOS
 * notification banner. It's deliberately separate from the inline `notice`
 * strip used elsewhere on the page: this one is for a single, short-lived
 * confirmation ("this specific thing just succeeded"), not for errors that
 * need to stay put until the user has read them.
 */
function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = requestAnimationFrame(() => setVisible(true));
    const hideTimer = setTimeout(() => setVisible(false), 3000);
    const removeTimer = setTimeout(onDone, 3350);
    return () => {
      cancelAnimationFrame(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`toast ${visible ? 'toast-visible' : ''}`} role="status">
      <span className="toast-icon" aria-hidden="true">
        ✓
      </span>
      {text}
    </div>
  );
}

/**
 * "Add employee" — the one bit of reference-data management this app has
 * (everything else is fixed seed data). Submitting sends the three fields
 * to the backend, which verifies they're all present and that the id isn't
 * already taken (service-requests.service.ts, `createEmployee`) before
 * actually creating the row — the "credentials and verification" step the
 * success toast in the parent reports on.
 */
function AddEmployeeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (employee: Employee) => void;
}) {
  const [id, setId] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.createEmployee(id.trim(), fullName.trim(), department.trim());
      onCreated(created);
    } catch (err) {
      setError(apiErrorText(err, 'Something went wrong adding this employee.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-employee-title">
        <div className="modal-header">
          <h2 id="add-employee-title">Add employee</h2>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="new-employee-id">Employee id</label>
          <input
            id="new-employee-id"
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="EMP-4"
            required
          />

          <label htmlFor="new-employee-name">Full name</label>
          <input
            id="new-employee-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jordan Lee"
            required
          />

          <label htmlFor="new-employee-department">Department</label>
          <input
            id="new-employee-department"
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="IT"
            required
          />

          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting || !id.trim() || !fullName.trim() || !department.trim()}>
            {submitting ? 'Adding…' : 'Add employee'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * "Add service" — the same idea as AddEmployeeModal, for the other bit of
 * reference data a request can be filed against. Same validation shape on
 * the backend (createService): all fields required, id must be unique.
 */
function AddServiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (service: Service) => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [departmentOwner, setDepartmentOwner] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.createService(id.trim(), name.trim(), departmentOwner.trim());
      onCreated(created);
    } catch (err) {
      setError(apiErrorText(err, 'Something went wrong adding this service.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-service-title">
        <div className="modal-header">
          <h2 id="add-service-title">Add service</h2>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="new-service-id">Service id</label>
          <input
            id="new-service-id"
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="SVC-4"
            required
          />

          <label htmlFor="new-service-name">Name</label>
          <input
            id="new-service-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Standing desk request"
            required
          />

          <label htmlFor="new-service-department">Owning department</label>
          <input
            id="new-service-department"
            type="text"
            value={departmentOwner}
            onChange={(e) => setDepartmentOwner(e.target.value)}
            placeholder="Facilities"
            required
          />

          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !id.trim() || !name.trim() || !departmentOwner.trim()}
          >
            {submitting ? 'Adding…' : 'Add service'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * The "click a request, see its status" panel. It fetches the request
 * itself plus its full history (backend/src/service-requests, the
 * `/:id` and `/:id/history` endpoints) whenever `requestId` changes, so it
 * shows the true current state — not just whatever the list happened to
 * have cached — and a timeline of every status change with who made it.
 *
 * Cancelling lives here too, in one place, instead of also having a
 * duplicate "Cancel" button in the list row.
 */
function RequestDetailModal({
  requestId,
  employeeId,
  services,
  onClose,
  onChanged,
}: {
  requestId: string;
  employeeId: string;
  services: Service[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [requestData, setRequestData] = useState<ServiceRequest | null>(null);
  const [history, setHistory] = useState<RequestStatusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([api.get(requestId), api.history(requestId)])
      .then(([req, events]) => {
        setRequestData(req);
        setHistory(events);
      })
      .catch((err) => setLoadError(apiErrorText(err, 'Could not load this request.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    closeButtonRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleCancel = async () => {
    setActionError(null);
    setCancelling(true);
    try {
      await api.cancel(requestId, employeeId);
      load();
      onChanged();
    } catch (err) {
      setActionError(apiErrorText(err, 'Something went wrong cancelling the request.'));
    } finally {
      setCancelling(false);
    }
  };

  const serviceName = requestData
    ? (services.find((s) => s.id === requestData.serviceId)?.name ?? requestData.serviceId)
    : '';

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-modal-title"
      >
        <div className="modal-header">
          <h2 id="request-modal-title">{requestId}</h2>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {loading && <p className="hint">Loading…</p>}
        {loadError && (
          <p className="notice notice-error" role="alert">
            {loadError}
          </p>
        )}

        {requestData && !loading && (
          <>
            <div className="modal-summary">
              <div>
                <div className="modal-service">{serviceName}</div>
                <div className="hint">Submitted {formatDateTime(requestData.createdAt)}</div>
              </div>
              <StatusBadge status={requestData.currentStatus} />
            </div>

            <h3 className="modal-section-title">Status history</h3>
            <ol className="timeline">
              {history.map((event) => (
                <li key={event.id} className="timeline-item">
                  <span className={`timeline-dot timeline-dot-${event.status.toLowerCase()}`} aria-hidden="true" />
                  <div>
                    <div className="timeline-row">
                      <StatusBadge status={event.status} />
                      <span className="hint">by {event.changedBy}</span>
                      <span className="hint">· {formatDateTime(event.occurredAt)}</span>
                    </div>
                    {event.comment && <p className="timeline-comment">"{event.comment}"</p>}
                  </div>
                </li>
              ))}
            </ol>

            {actionError && (
              <p className="notice notice-error" role="alert">
                {actionError}
              </p>
            )}

            {requestData.currentStatus === 'SUBMITTED' && (
              <button type="button" className="button-danger" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel this request'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The Week 4 AI-assisted Request Intake capability, from the employee's
 * side (docs/week4-production-ai.md has the full design). An employee
 * describes what they need in their own words; the backend returns at
 * most one advisory candidate service, never anything else — nothing is
 * submitted or changed here. "Use this suggestion" only pre-fills the
 * existing service picker below; the employee still reviews it and clicks
 * "Submit request" themselves, exactly as if they'd picked it by hand.
 * That's the "AI is advisory, software/human authority stays final" rule
 * made visible in the UI, not just enforced on the backend.
 */
function IntakeAssistant({
  services,
  onUseSuggestion,
}: {
  services: Service[];
  onUseSuggestion: (serviceId: string) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntakeSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usedServiceId, setUsedServiceId] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setUsedServiceId(null);
    try {
      setResult(await api.suggestIntake(text.trim()));
    } catch (err) {
      setError(apiErrorText(err, 'Could not get a suggestion right now.'));
    } finally {
      setLoading(false);
    }
  };

  const suggestedService = result?.matched ? services.find((s) => s.id === result.serviceId) : undefined;

  return (
    <div className="intake-assistant">
      <label htmlFor="intake-text">Describe what you need (optional)</label>
      <textarea
        id="intake-text"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. “my laptop screen is cracked” — we'll suggest a matching service"
      />
      <button
        type="button"
        className="button-ghost intake-ask-button"
        onClick={handleAsk}
        disabled={loading || !text.trim()}
      >
        {loading ? 'Thinking…' : 'Suggest a service'}
      </button>

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {result?.matched && (
        <div className="intake-suggestion" role="status">
          <div className="intake-suggestion-text">
            Suggested: <strong>{suggestedService?.name ?? result.serviceId}</strong>
            {suggestedService && <> ({suggestedService.departmentOwner})</>}
            <span className="intake-confidence"> — {Math.round(result.confidence * 100)}% match</span>
          </div>
          {usedServiceId === result.serviceId ? (
            <span className="hint">Applied to the form below.</span>
          ) : (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onUseSuggestion(result.serviceId);
                setUsedServiceId(result.serviceId);
              }}
            >
              Use this suggestion
            </button>
          )}
        </div>
      )}

      {result && !result.matched && (
        <p className="hint">No confident suggestion for that — pick a service below instead.</p>
      )}
    </div>
  );
}

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [employeeId, setEmployeeId] = useState<string>('');

  const [serviceId, setServiceId] = useState<string>('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [lookupId, setLookupId] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [addingService, setAddingService] = useState(false);

  // "My requests" search/filter — client-side, since the list is already
  // loaded for the current employee (data-model.md's "my requests" access
  // pattern already narrows it to one employee; this narrows further).
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'ALL'>('ALL');

  // One shared feedback banner for page-level actions (submit, lookup).
  // Cancelling has its own inline feedback inside the detail modal.
  const [notice, setNotice] = useState<Notice | null>(null);

  // The top-of-screen success toast (see the Toast component) — a separate
  // queue from `notice` since it's transient and only used for "added".
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const showToast = (text: string) => setToast({ key: Date.now(), text });

  useEffect(() => {
    api
      .listEmployees()
      .then((list) => {
        setEmployees(list);
        if (list.length > 0) setEmployeeId(list[0].id);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
    api
      .listServices()
      .then((list) => {
        setServices(list);
        if (list.length > 0) setServiceId(list[0].id);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  const loadMyRequests = (forEmployeeId: string) => {
    if (!forEmployeeId) return;
    api
      .myRequests(forEmployeeId)
      .then(setRequests)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    loadMyRequests(employeeId);
  }, [employeeId]);

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();
    setNotice(null);
    setSubmitting(true);
    try {
      const created = await api.submit(employeeId, serviceId, comment);
      setComment('');
      setNotice({ kind: 'ok', text: `${created.id} submitted.` });
      loadMyRequests(employeeId);
    } catch (err) {
      setNotice({ kind: 'error', text: apiErrorText(err, 'Something went wrong submitting the request.') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookup = (evt: FormEvent) => {
    evt.preventDefault();
    setLookupError(null);
    api
      .get(lookupId.trim())
      .then((found) => {
        setOpenRequestId(found.id);
        setLookupId('');
      })
      .catch((err) => setLookupError(apiErrorText(err, 'That request could not be found.')));
  };

  const currentEmployee = employees.find((e) => e.id === employeeId);

  const filteredRequests = requests.filter((r) => {
    if (statusFilter !== 'ALL' && r.currentStatus !== statusFilter) return false;
    if (!searchText.trim()) return true;
    const needle = searchText.trim().toLowerCase();
    const serviceName = services.find((s) => s.id === r.serviceId)?.name ?? r.serviceId;
    return r.id.toLowerCase().includes(needle) || serviceName.toLowerCase().includes(needle);
  });

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M8 12.5l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand-name">Operations Hub</span>
        </div>

        <div className="topbar-right">
          <button type="button" className="button-ghost" onClick={() => setAddingEmployee(true)}>
            + Add employee
          </button>

          <label className="identity-switcher">
            <span className="visually-hidden-label">Acting as</span>
            <select
              id="identity"
              aria-label="Acting as"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.id}) — {e.department}
                </option>
              ))}
            </select>
            {currentEmployee && <span className="identity-avatar">{currentEmployee.fullName.charAt(0)}</span>}
          </label>
        </div>
      </header>

      <main className="layout">
        {notice && (
          <p className={`notice notice-${notice.kind}`} role="status">
            {notice.text}
          </p>
        )}

        <div className="columns">
          <section className="card form-card" aria-labelledby="submit-heading">
            <h2 id="submit-heading">New request</h2>
            <IntakeAssistant services={services} onUseSuggestion={setServiceId} />
            <form onSubmit={handleSubmit}>
              <div className="label-row">
                <label htmlFor="service">Service</label>
                <button type="button" className="link-button" onClick={() => setAddingService(true)}>
                  + Add service
                </button>
              </div>
              <select id="service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.departmentOwner})
                  </option>
                ))}
              </select>

              <label htmlFor="comment">Comment (optional)</label>
              <input
                id="comment"
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Any detail that helps whoever picks this up"
              />

              <button type="submit" disabled={submitting || !employeeId || !serviceId}>
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </form>

            <div className="divider" />

            <h2>Find a request</h2>
            <p className="hint">Look up any request by id — including one you don't own, to see the flow refuse a cancel that isn't yours.</p>
            <form onSubmit={handleLookup}>
              <label htmlFor="lookup-id">Request id</label>
              <input
                id="lookup-id"
                type="text"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                placeholder="REQ-1001"
              />
              <button type="submit" disabled={!lookupId.trim()}>
                View status
              </button>
              {lookupError && (
                <p className="notice notice-error" role="alert">
                  {lookupError}
                </p>
              )}
            </form>
          </section>

          <section className="card list-card" aria-labelledby="my-requests-heading">
            <h2 id="my-requests-heading">My requests</h2>
            {loadError && (
              <p className="notice notice-error" role="alert">
                {loadError}
              </p>
            )}

            {requests.length > 0 && (
              <div className="filter-row">
                <input
                  type="text"
                  aria-label="Search my requests"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search by id or service…"
                  className="filter-search"
                />
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as RequestStatus | 'ALL')}
                  className="filter-status"
                >
                  <option value="ALL">All statuses</option>
                  {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {requests.length === 0 && !loadError && (
              <div className="empty-state">
                <p>No requests yet.</p>
                <p className="hint">Submit one on the left — it'll show up here.</p>
              </div>
            )}
            {requests.length > 0 && filteredRequests.length === 0 && (
              <div className="empty-state">
                <p>No requests match your search.</p>
              </div>
            )}
            <ul className="request-list">
              {filteredRequests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="request-row"
                    data-testid="request-row"
                    onClick={() => setOpenRequestId(r.id)}
                  >
                    <span className="request-row-left">
                      <strong>{r.id}</strong>
                      <span className="request-service">
                        {services.find((s) => s.id === r.serviceId)?.name ?? r.serviceId}
                      </span>
                    </span>
                    <StatusBadge status={r.currentStatus} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      {openRequestId && (
        <RequestDetailModal
          requestId={openRequestId}
          employeeId={employeeId}
          services={services}
          onClose={() => setOpenRequestId(null)}
          onChanged={() => loadMyRequests(employeeId)}
        />
      )}

      {addingEmployee && (
        <AddEmployeeModal
          onClose={() => setAddingEmployee(false)}
          onCreated={(created) => {
            setEmployees((prev) => [...prev, created]);
            setAddingEmployee(false);
            showToast(`${created.fullName} (${created.id}) was added`);
          }}
        />
      )}

      {addingService && (
        <AddServiceModal
          onClose={() => setAddingService(false)}
          onCreated={(created) => {
            setServices((prev) => [...prev, created]);
            setServiceId(created.id);
            setAddingService(false);
            showToast(`${created.name} (${created.id}) was added`);
          }}
        />
      )}

      {toast && <Toast key={toast.key} text={toast.text} onDone={() => setToast(null)} />}
    </div>
  );
}
