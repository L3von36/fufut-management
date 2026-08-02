/* ============================================================
   FU FUT COFFEE — Button State Utility (Standalone version for biz-old)
   Centralized button lifecycle: idle → loading → success/error → reset
   ============================================================ */

(function initButtonStates() {
  'use strict';

  const SUCCESS_DURATION = 2000;

  const LABELS = {
    save:        { loading: 'Saving...',     success: 'Saved ✓',       error: 'Save Failed' },
    submit:      { loading: 'Submitting...',  success: 'Submitted ✓',   error: 'Submit Failed' },
    send:        { loading: 'Sending...',     success: 'Sent ✓',       error: 'Send Failed' },
    upload:      { loading: 'Uploading...',   success: 'Uploaded ✓',   error: 'Upload Failed' },
    download:    { loading: 'Downloading...', success: 'Downloaded ✓', error: 'Download Failed' },
    delete:      { loading: 'Deleting...',    success: 'Deleted ✓',    error: 'Delete Failed' },
    update:      { loading: 'Updating...',    success: 'Updated ✓',    error: 'Update Failed' },
    create:      { loading: 'Creating...',    success: 'Created ✓',    error: 'Create Failed' },
    publish:     { loading: 'Publishing...',  success: 'Published ✓',  error: 'Publish Failed' },
    login:       { loading: 'Signing in...',  success: 'Signed In ✓',  error: 'Login Failed' },
    logout:      { loading: 'Signing out...', success: 'Signed Out ✓', error: 'Logout Failed' },
    register:    { loading: 'Registering...', success: 'Registered ✓', error: 'Registration Failed' },
    verify:      { loading: 'Verifying...',   success: 'Verified ✓',   error: 'Verification Failed' },
    pay:         { loading: 'Processing Payment...', success: 'Paid ✓', error: 'Payment Failed' },
    checkout:    { loading: 'Processing...',  success: 'Checked Out ✓', error: 'Checkout Failed' },
    book:        { loading: 'Booking...',     success: 'Booked ✓',     error: 'Booking Failed' },
    reserve:     { loading: 'Reserving...',   success: 'Reserved ✓',   error: 'Reservation Failed' },
    approve:     { loading: 'Approving...',   success: 'Approved ✓',   error: 'Approval Failed' },
    reject:      { loading: 'Rejecting...',   success: 'Rejected ✓',   error: 'Rejection Failed' },
    archive:     { loading: 'Archiving...',   success: 'Archived ✓',   error: 'Archive Failed' },
    restore:     { loading: 'Restoring...',   success: 'Restored ✓',   error: 'Restore Failed' },
    refresh:     { loading: 'Refreshing...',  success: 'Refreshed ✓', error: 'Refresh Failed' }
  };

  function getLabels(action) {
    return LABELS[action] || {
      loading: action ? action.charAt(0).toUpperCase() + action.slice(1) + '...' : 'Loading...',
      success: 'Done ✓',
      error: 'Try Again'
    };
  }

  const states = new Map();

  function getState(btn) {
    if (!states.has(btn)) {
      states.set(btn, { state: 'idle', originalText: btn.textContent.trim() });
    }
    return states.get(btn);
  }

  function setLoading(btn, labels) {
    const s = getState(btn);
    s.state = 'loading';
    btn.classList.add('btn-loading');
    btn.classList.remove('btn-success-state', 'btn-error-state');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> ' + labels.loading;
  }

  function setSuccess(btn, labels) {
    const s = getState(btn);
    s.state = 'success';
    btn.classList.remove('btn-loading', 'btn-error-state');
    btn.classList.add('btn-success-state');
    btn.disabled = false;
    btn.setAttribute('aria-busy', 'false');
    btn.innerHTML = '<span class="btn-check" aria-hidden="true">✓</span> ' + labels.success;
    clearTimeout(btn._resetTimer);
    btn._resetTimer = setTimeout(function() { reset(btn); }, SUCCESS_DURATION);
  }

  function setError(btn, labels) {
    const s = getState(btn);
    s.state = 'error';
    btn.classList.remove('btn-loading', 'btn-success-state');
    btn.classList.add('btn-error-state');
    btn.disabled = false;
    btn.setAttribute('aria-busy', 'false');
    btn.innerHTML = '<span class="btn-error-icon" aria-hidden="true">!</span> ' + labels.error;
  }

  function reset(btn) {
    const s = getState(btn);
    s.state = 'idle';
    btn.classList.remove('btn-loading', 'btn-success-state', 'btn-error-state');
    btn.disabled = false;
    btn.setAttribute('aria-busy', 'false');
    btn.innerHTML = '';
    btn.textContent = s.originalText;
  }

  window.buttonState = {
    wrap: async function(btn, asyncFn, action, customLabels) {
      const labels = { ...getLabels(action), ...customLabels };
      setLoading(btn, labels);
      try {
        await asyncFn();
        setSuccess(btn, labels);
      } catch (e) {
        setError(btn, labels);
        throw e;
      }
    },
    setLoading: setLoading,
    setSuccess: setSuccess,
    setError: setError,
    reset: reset
  };

  window.registerButtonAction = function(selector, asyncFn) {
    var btn = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (btn) {
      btn._btnAsyncHandler = asyncFn;
    }
  };

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-btn-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-btn-action');
    const handler = btn._btnAsyncHandler;
    if (!handler) return;
    e.preventDefault();
    window.buttonState.wrap(btn, handler, action);
  });

  // Inject CSS for button states if not present
  if (!document.querySelector('style[data-button-states]')) {
    const style = document.createElement('style');
    style.setAttribute('data-button-states', 'true');
    style.textContent = `
      .btn-loading { opacity: .85; cursor: wait; pointer-events: none; }
      .btn-success-state { background: var(--success) !important; border-color: var(--success) !important; color: #fff !important; cursor: default; }
      .btn-error-state { background: var(--danger) !important; border-color: var(--danger) !important; color: #fff !important; cursor: default; }
      .btn-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: btnSpin .6s linear infinite; flex-shrink: 0; }
      @keyframes btnSpin { to { transform: rotate(360deg); } }
      .btn-check, .btn-error-icon { font-weight: 700; font-size: 1.1em; flex-shrink: 0; color: #fff; }
      button:disabled { opacity: .85; cursor: wait; }
    `;
    document.head.appendChild(style);
  }

})();
