/* ═══════════════════════════════════════════════════════════
   CTF - Utilidades compartidas (utils.js)
   ═══════════════════════════════════════════════════════════ */

const CTF = {
  getToken: () => localStorage.getItem('ctf_token'),
  getUser:  () => { try { return JSON.parse(localStorage.getItem('ctf_user')); } catch { return null; } },

  setSession: (token, user) => {
    localStorage.setItem('ctf_token', token);
    localStorage.setItem('ctf_user', JSON.stringify(user));
  },

  clearSession: () => {
    localStorage.removeItem('ctf_token');
    localStorage.removeItem('ctf_user');
  },

  isLoggedIn: () => !!CTF.getToken(),

  requireAuth: (allowedRoles = []) => {
    const token = CTF.getToken();
    const user  = CTF.getUser();
    if (!token || !user) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login.html?returnTo=${returnTo}`;
      return null;
    }
    if (allowedRoles.length && !allowedRoles.includes(user.rol)) {
      CTF.showToast('No tienes acceso a esta sección', 'error');
      window.location.href = '/dashboard.html';
      return null;
    }
    return user;
  },

  api: async (method, path, body = null) => {
    const token = CTF.getToken();
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    };
    if (body) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(`/api${path}`, opts);
    } catch (e) {
      throw new Error('Sin conexión al servidor. Verifica tu conexión a internet.');
    }

    const data = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor' }));

    if (res.status === 401) {
      if (data.code === 'TOKEN_EXPIRED') {
        CTF.clearSession();
        CTF.showToast('Tu sesión expiró. Por favor inicia sesión nuevamente.', 'error');
        setTimeout(() => window.location.href = '/login.html', 1500);
        throw new Error('Sesión expirada');
      }
      if (data.code === 'PASSWORD_CHANGE_REQUIRED') {
        window.location.href = '/cambiar-password.html';
        throw new Error('Cambio de contraseña requerido');
      }
      throw new Error(data.error || 'No autorizado');
    }

    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  },

  get:    (path)       => CTF.api('GET',  path),
  post:   (path, body) => CTF.api('POST', path, body),
  put:    (path, body) => CTF.api('PUT',  path, body),
  delete: (path)       => CTF.api('DELETE', path),

  showToast: (message, type = 'info', duration = 3500) => {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all .3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  setButtonLoading: (btn, loading, text = '') => {
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> ${text || 'Cargando...'}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalText || text;
    }
  },

  showAlert: (containerId, message, type = 'error') => {
    const icons = { error: '⚠', success: '✓', info: 'ℹ', warning: '⚡' };
    const el = document.getElementById(containerId);
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  hideAlert: (containerId) => {
    const el = document.getElementById(containerId);
    if (el) el.classList.add('hidden');
  },

  formatDate: (dateStr) => {
    if (!dateStr) return '—';
    return new Intl.DateTimeFormat('es-GT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Guatemala',
    }).format(new Date(dateStr));
  },

  truncate: (str, n = 20) => str && str.length > n ? str.slice(0, n) + '...' : str,
  shortId:  (id) => id ? id.slice(0, 8).toUpperCase() : '',

  rolLabel: (rol) => ({
    'TESORERIA':    'Tesorería',
    'CONTADOR':     'Contador',
    'CONTADOR_OFC': 'Contador Oficina',
  }[rol] || rol),

  rolClass: (rol) => ({
    'TESORERIA':    'role-tesoreria',
    'CONTADOR':     'role-contador',
    'CONTADOR_OFC': 'role-contador-ofc',
  }[rol] || ''),
};

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar(activePage) {
  const user = CTF.getUser();
  if (!user) return;

  const navMap = {
    CONTADOR: [
      { href: '/dashboard.html',        icon: '📊', label: 'Dashboard' },
      { href: '/nueva-solicitud.html',  icon: '📤', label: 'Nueva Solicitud' },
      { href: '/mis-solicitudes.html',  icon: '📋', label: 'Mis Solicitudes' },
      { href: '/cambiar-password.html', icon: '🔒', label: 'Cambiar Contraseña' },
    ],
    TESORERIA: [
      { href: '/dashboard.html',        icon: '📊', label: 'Dashboard' },
      { href: '/mis-solicitudes.html',  icon: '📥', label: 'Solicitudes' },
      { href: '/cambiar-password.html', icon: '🔒', label: 'Cambiar Contraseña' },
    ],
    CONTADOR_OFC: [
      { href: '/dashboard.html',        icon: '📊', label: 'Dashboard' },
      { href: '/nueva-solicitud.html',  icon: '📤', label: 'Nueva Solicitud' },
      { href: '/mis-solicitudes.html',  icon: '📋', label: 'Solicitudes' },
      { href: '/cambiar-password.html', icon: '🔒', label: 'Cambiar Contraseña' },
    ],
  };

  const links = navMap[user.rol] || navMap.CONTADOR;
  const navHtml = links.map(l => `
    <a href="${l.href}" class="nav-item ${activePage === l.href ? 'active' : ''}">
      <span class="nav-icon">${l.icon}</span>
      <span>${l.label}</span>
    </a>
  `).join('');

  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="sidebar-logo">
        <img src="/assets/logo.png" alt="CTF" style="height:38px; margin-bottom:8px;" onerror="this.style.display='none'" />
        <div class="logo-title">CTF</div>
        <div class="logo-sub">Control de Traslado de Facturas</div>
      </div>
      <div class="sidebar-user">
        <div class="user-name">${user.nombre}</div>
        <span class="user-role ${CTF.rolClass(user.rol)}">${CTF.rolLabel(user.rol)}</span>
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-bottom">
        <button class="btn-logout" onclick="CTF_logout()">
          <span>🚪</span> Cerrar Sesión
        </button>
      </div>
    `;
  }
}

async function CTF_logout() {
  try { await CTF.post('/auth/logout'); } catch {}
  CTF.clearSession();
  window.location.href = '/login.html';
}

function initMobileSidebar() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay?.classList.toggle('active');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }
}
