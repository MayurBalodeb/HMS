/**
 * Central API client. Change API_BASE if your backend runs elsewhere.
 */
const API_BASE = window.HMS_API_BASE || (window.location.origin && window.location.origin.startsWith('http') ? `${window.location.origin}/api` : 'http://localhost:5000/api');

const Api = {
  base: API_BASE,

  token() {
    return localStorage.getItem('hms_token');
  },

  setToken(token) {
    if (token) localStorage.setItem('hms_token', token);
    else localStorage.removeItem('hms_token');
  },

  setUser(user) {
    if (user) localStorage.setItem('hms_user', JSON.stringify(user));
    else localStorage.removeItem('hms_user');
  },

  getUser() {
    const raw = localStorage.getItem('hms_user');
    return raw ? JSON.parse(raw) : null;
  },

  async request(method, path, body, isForm = false) {
    const headers = {};
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isForm) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body !== undefined && body !== null) {
      opts.body = isForm ? body : JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(`${this.base}${path}`, opts);
    } catch (err) {
      throw new Error('Cannot reach the server. Is the backend running on ' + this.base + '?');
    }

    let data;
    try { data = await res.json(); } catch { data = {}; }

    if (res.status === 401) {
      this.setToken(null);
      this.setUser(null);
      const inPagesFolder = location.pathname.includes('/pages/');
      const alreadyOnLogin = location.pathname.endsWith('login.html');
      if (!alreadyOnLogin) {
        location.href = inPagesFolder ? '../login.html' : 'login.html';
      }
    }

    if (!res.ok || data.success === false) {
      throw new Error(data.message || `Request failed (${res.status})`);
    }
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  del(path) { return this.request('DELETE', path); },
  postForm(path, formData) { return this.request('POST', path, formData, true); },

  fileUrl(relativeUploadPath) {
    return `${this.base.replace('/api', '')}/uploads/${relativeUploadPath}`;
  }
};
